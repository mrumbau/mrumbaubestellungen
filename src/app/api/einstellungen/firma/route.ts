import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { requireAuth } from "@/lib/require-auth";
import { parseBetrag, TOLERANZ_BETRAG_MAX, TOLERANZ_PROZENT_MAX, TOLERANZ_SCHLUESSEL } from "@/lib/toleranz";
import { leseZahltage, ZAHLUNGSLAUF_SCHLUESSEL } from "@/lib/zahlungslauf";

// GET /api/einstellungen/firma – Alle Firma-Einstellungen laden
export async function GET() {
  try {
    const auth = await requireAuth(["admin"]);
    if (auth.response) return auth.response;

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("firma_einstellungen")
      .select("schluessel, wert");

    if (error) {
      return NextResponse.json({ error: "Laden fehlgeschlagen" }, { status: 500 });
    }

    const einstellungen: Record<string, string> = {};
    for (const row of data || []) {
      einstellungen[row.schluessel] = row.wert;
    }

    return NextResponse.json({ einstellungen });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}

// PUT /api/einstellungen/firma – Einstellung aktualisieren (upsert)
export async function PUT(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const auth = await requireAuth(["admin"]);
    if (auth.response) return auth.response;

    const supabase = await createServerSupabaseClient();
    const body = await request.json();
    const { schluessel, wert } = body;

    if (!schluessel || typeof schluessel !== "string") {
      return NextResponse.json({ error: "Schlüssel erforderlich" }, { status: 400 });
    }

    const erlaubteSchluessel = ["buero_adresse", "konfidenz_direkt", "konfidenz_vorschlag", ...TOLERANZ_SCHLUESSEL, ZAHLUNGSLAUF_SCHLUESSEL];
    if (!erlaubteSchluessel.includes(schluessel)) {
      return NextResponse.json({ error: "Unbekannter Schlüssel" }, { status: 400 });
    }

    // 11.10.2026 — Toleranz (lib/toleranz.ts): Zahl im erlaubten Bereich,
    // sonst 400 statt stillem Standard.
    let wertText = String(wert ?? "");
    if (schluessel === "toleranz_prozent" || schluessel === "toleranz_betrag") {
      const max = schluessel === "toleranz_prozent" ? TOLERANZ_PROZENT_MAX : TOLERANZ_BETRAG_MAX;
      const zahl = parseBetrag(wertText);
      if (zahl === null || zahl < 0 || zahl > max) {
        return NextResponse.json(
          { error: `${schluessel === "toleranz_prozent" ? "Prozent" : "Betrag"} muss zwischen 0 und ${max} liegen` },
          { status: 400 },
        );
      }
      wertText = String(zahl);
    }
    // 12.10.2026 — Zahltage (lib/zahlungslauf.ts): "20" oder "10,20", nur 1 bis 28.
    if (schluessel === ZAHLUNGSLAUF_SCHLUESSEL) {
      const tage = wertText.split(/[,;\s]+/).filter(Boolean);
      const gelesen = leseZahltage(wertText);
      if (tage.length === 0 || gelesen.length !== tage.length) {
        return NextResponse.json(
          { error: "Zahltage: Tage im Monat von 1 bis 28, durch Komma getrennt (z. B. 20 oder 10,20)" },
          { status: 400 },
        );
      }
      wertText = gelesen.join(",");
    }

    const { error } = await supabase
      .from("firma_einstellungen")
      .upsert({ schluessel, wert: wertText }, { onConflict: "schluessel" });

    if (error) {
      return NextResponse.json({ error: "Speichern fehlgeschlagen" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
