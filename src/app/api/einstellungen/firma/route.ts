import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";

// GET /api/einstellungen/firma – Alle Firma-Einstellungen laden
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const { data: profil } = await supabase
      .from("benutzer_rollen")
      .select("rolle")
      .eq("user_id", user.id)
      .single();

    if (!profil || profil.rolle !== "admin") {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("firma_einstellungen")
      .select("schluessel, wert");

    if (error) {
      return NextResponse.json({ error: "Laden fehlgeschlagen" }, { status: 500 });
    }

    // Als Key-Value-Objekt zurückgeben
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

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const { data: profil } = await supabase
      .from("benutzer_rollen")
      .select("rolle")
      .eq("user_id", user.id)
      .single();

    if (!profil || profil.rolle !== "admin") {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

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
