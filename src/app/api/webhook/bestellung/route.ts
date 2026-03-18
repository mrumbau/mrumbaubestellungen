import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isValidKuerzel, isValidDomain, validateTextLength } from "@/lib/validation";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";

// POST /api/webhook/bestellung – Empfängt Signal von Chrome Extension
export async function POST(request: NextRequest) {
  try {
    // Rate-Limiting: max 10 Requests/Minute pro IP
    const rlKey = getRateLimitKey(request, "webhook-bestellung");
    const rl = checkRateLimit(rlKey, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Zu viele Anfragen. Bitte warten." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      );
    }

    const body = await request.json();
    const { kuerzel, haendler_domain, zeitstempel, secret, erkennung, bestellnummer, seiten_url } = body;

    // Secret prüfen
    if (secret !== process.env.EXTENSION_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!kuerzel || !haendler_domain) {
      return NextResponse.json(
        { error: "kuerzel und haendler_domain sind erforderlich" },
        { status: 400 }
      );
    }

    // Input-Validierung
    if (!isValidKuerzel(kuerzel)) {
      return NextResponse.json({ error: "Ungültiges Kürzel" }, { status: 400 });
    }

    if (!isValidDomain(haendler_domain) || !validateTextLength(haendler_domain, 253)) {
      return NextResponse.json({ error: "Ungültige Domain" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Duplikat-Check VOR Insert: gleicher Besteller + gleicher Händler innerhalb 5 Minuten?
    const { data: recentSignals } = await supabase
      .from("bestellung_signale")
      .select("id")
      .eq("kuerzel", kuerzel)
      .eq("haendler_domain", haendler_domain)
      .gte("zeitstempel", new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .limit(1);

    if (recentSignals && recentSignals.length > 0) {
      return NextResponse.json({ success: true, signal_id: recentSignals[0].id, deduplicated: true });
    }

    // Signal speichern
    const { data, error } = await supabase
      .from("bestellung_signale")
      .insert({
        kuerzel,
        haendler_domain,
        zeitstempel: zeitstempel || new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      logError("/api/webhook/bestellung", "Signal-Speichern fehlgeschlagen", error);
      return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
    }

    // Besteller-Name aus benutzer_rollen holen
    const { data: benutzer } = await supabase
      .from("benutzer_rollen")
      .select("name")
      .eq("kuerzel", kuerzel)
      .single();

    // Händler-Name aus haendler-Tabelle holen
    const { data: haendler } = await supabase
      .from("haendler")
      .select("id, name")
      .eq("domain", haendler_domain)
      .single();

    // Bestellung mit Status "erwartet" anlegen
    await supabase.from("bestellungen").insert({
      bestellnummer: bestellnummer || null,
      haendler_id: haendler?.id || null,
      haendler_name: haendler?.name || haendler_domain,
      besteller_kuerzel: kuerzel,
      besteller_name: benutzer?.name || kuerzel,
      status: "erwartet",
      zuordnung_methode: "extension_signal",
    });

    // Bei KI- oder Score-Erkennung: URL-Pattern lernen
    if (erkennung && erkennung !== "bekannt" && seiten_url) {
      try {
        const urlPath = new URL(seiten_url).pathname;
        // Pattern generalisieren: /order/12345 → /order/
        const pattern = urlPath
          .replace(/\/\d{3,}(?=[\/\?]|$)/g, "") // Bestellnummern entfernen
          .replace(/\/[a-f0-9-]{20,}(?=[\/\?]|$)/g, "") // UUIDs entfernen
          .replace(/\/+$/, "") // Trailing Slashes entfernen
          || "/";

        if (pattern.length >= 4) { // Mindestens sinnvoller Pfad
          if (haendler) {
            // Bestehendem Händler URL-Pattern hinzufügen (falls noch nicht vorhanden)
            const { data: existing } = await supabase
              .from("haendler")
              .select("url_muster")
              .eq("id", haendler.id)
              .single();

            const muster: string[] = existing?.url_muster || [];
            if (!muster.includes(pattern)) {
              await supabase
                .from("haendler")
                .update({ url_muster: [...muster, pattern] })
                .eq("id", haendler.id);
              console.log(`[Webhook] Neues URL-Pattern gelernt: ${haendler_domain} → ${pattern}`);
            }
          } else {
            // Neuen Händler mit URL-Pattern anlegen
            const { data: existingH } = await supabase
              .from("haendler")
              .select("id, url_muster")
              .eq("domain", haendler_domain)
              .limit(1);

            if (!existingH || existingH.length === 0) {
              await supabase.from("haendler").insert({
                name: haendler_domain,
                domain: haendler_domain,
                email_absender: [],
                url_muster: [pattern],
              });
              console.log(`[Webhook] Neuer Händler via ${erkennung} angelegt: ${haendler_domain} (${pattern})`);
            } else {
              // Händler existiert, Pattern hinzufügen
              const muster: string[] = existingH[0].url_muster || [];
              if (!muster.includes(pattern)) {
                await supabase
                  .from("haendler")
                  .update({ url_muster: [...muster, pattern] })
                  .eq("id", existingH[0].id);
                console.log(`[Webhook] URL-Pattern gelernt: ${haendler_domain} → ${pattern}`);
              }
            }
          }
        }
      } catch {
        // URL-Parsing fehlgeschlagen — kein Problem, Pattern-Lernen ist optional
      }
    }

    if (erkennung && erkennung !== "bekannt") {
      console.log(`[Webhook] Händler erkannt via ${erkennung}: ${haendler_domain} (${kuerzel})`);
    }

    // Webhook-Log: Erfolg
    await supabase.from("webhook_logs").insert({
      typ: "extension",
      status: "success",
      bestellnummer: bestellnummer || null,
    });

    return NextResponse.json({ success: true, signal_id: data.id });
  } catch (err) {
    // Webhook-Log: Fehler
    try {
      const supabase = createServiceClient();
      await supabase.from("webhook_logs").insert({
        typ: "extension",
        status: "error",
        fehler_text: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    } catch { /* Log-Fehler nicht weiter propagieren */ }

    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
