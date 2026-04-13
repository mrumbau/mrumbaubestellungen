import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isValidKuerzel, isValidDomain, validateTextLength } from "@/lib/validation";
import { checkRateLimit, checkGlobalRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { safeCompare } from "@/lib/safe-compare";

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
    if (!safeCompare(secret, process.env.EXTENSION_SECRET)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Globales Rate-Limiting (über alle Instanzen)
    const globalRl = await checkGlobalRateLimit("webhook-bestellung", 30, 60_000);
    if (!globalRl.allowed) {
      return NextResponse.json({ error: "Zu viele Anfragen. Bitte warten." }, { status: 429 });
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

    // Duplikat-Check: gleicher Besteller + gleicher Händler innerhalb 5 Minuten?
    // ABER: Wenn das neue Signal eine Bestellnummer hat und das alte nicht → altes upgraden
    // Nur pending Signale für Dedup prüfen (matched Signale sind schon verbraucht)
    const { data: recentSignals } = await supabase
      .from("bestellung_signale")
      .select("id, order_nummer, status")
      .eq("kuerzel", kuerzel)
      .eq("haendler_domain", haendler_domain)
      .eq("status", "pending")
      .gte("zeitstempel", new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .limit(1);

    if (recentSignals && recentSignals.length > 0) {
      const existing = recentSignals[0];
      const newOrderNr = bestellnummer && typeof bestellnummer === "string" && bestellnummer.length >= 3 ? bestellnummer.trim() : null;

      if (newOrderNr && !existing.order_nummer) {
        // Bestehendes Signal atomar upgraden (nur wenn noch pending → Race-Condition-Schutz)
        const { count } = await supabase.from("bestellung_signale")
          .update({ order_nummer: newOrderNr, confidence: 1.0 })
          .eq("id", existing.id)
          .eq("status", "pending");
        if ((count ?? 0) > 0) {
          return NextResponse.json({ success: true, signal_id: existing.id, upgraded: true });
        }
        // count === 0 → Signal wurde zwischenzeitlich gematcht, weiter unten neues anlegen
      } else {
        return NextResponse.json({ success: true, signal_id: existing.id, deduplicated: true });
      }
    }

    // Signal speichern (reaktiv — kein "erwartet"-Eintrag in bestellungen)
    // Das Signal wird erst bei Email-Eingang konsumiert um den Besteller zuzuordnen
    const urlPath = seiten_url ? (() => { try { return new URL(seiten_url).pathname; } catch { return null; } })() : null;
    const confidence = body.confidence != null ? Math.min(1.0, Math.max(0.0, Number(body.confidence))) : 0.5;

    // order_nummer: Von Extension extrahierte Bestellnummer (höchste Zuordnungs-Priorität)
    const orderNummer = bestellnummer && typeof bestellnummer === "string" && bestellnummer.length >= 3 && bestellnummer.length <= 30
      ? bestellnummer.trim() : null;

    const { data, error } = await supabase
      .from("bestellung_signale")
      .insert({
        kuerzel,
        haendler_domain,
        zeitstempel: zeitstempel || new Date().toISOString(),
        url_path: urlPath,
        page_title: body.page_title || null,
        confidence,
        status: "pending",
        order_nummer: orderNummer,
        erkennung: erkennung || null,
      })
      .select()
      .single();

    if (error) {
      logError("/api/webhook/bestellung", "Signal-Speichern fehlgeschlagen", error);
      return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
    }

    // Händler-Name aus haendler-Tabelle holen (für URL-Pattern-Learning)
    const { data: haendler } = await supabase
      .from("haendler")
      .select("id, name")
      .eq("domain", haendler_domain)
      .single();

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
            if (muster.length < 50 && pattern.length <= 200 && !muster.includes(pattern)) {
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
              if (muster.length < 50 && pattern.length <= 200 && !muster.includes(pattern)) {
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
