import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isValidKuerzel, isValidDomain, validateTextLength } from "@/lib/validation";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit";

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
    const { kuerzel, haendler_domain, zeitstempel, secret } = body;

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
      console.error("Signal-Speichern Fehler:", error);
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
      haendler_id: haendler?.id || null,
      haendler_name: haendler?.name || haendler_domain,
      besteller_kuerzel: kuerzel,
      besteller_name: benutzer?.name || kuerzel,
      status: "erwartet",
    });

    return NextResponse.json({ success: true, signal_id: data.id });
  } catch {
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
