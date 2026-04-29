import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { requireAuth } from "@/lib/require-auth";

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

    const erlaubteSchluessel = ["buero_adresse", "konfidenz_direkt", "konfidenz_vorschlag"];
    if (!erlaubteSchluessel.includes(schluessel)) {
      return NextResponse.json({ error: "Unbekannter Schlüssel" }, { status: 400 });
    }

    const { error } = await supabase
      .from("firma_einstellungen")
      .upsert({ schluessel, wert: String(wert ?? "") }, { onConflict: "schluessel" });

    if (error) {
      return NextResponse.json({ error: "Speichern fehlgeschlagen" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
