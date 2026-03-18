import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { validateTextLength } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { requireRoles } from "@/lib/auth";
import { logError } from "@/lib/logger";

// GET /api/subunternehmer – Alle Subunternehmer laden
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const { data: profil } = await supabase
      .from("benutzer_rollen")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!requireRoles(profil, "admin", "besteller")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const { data: subunternehmer, error } = await supabase
      .from("subunternehmer")
      .select("*")
      .order("firma", { ascending: true });

    if (error) {
      logError("/api/subunternehmer", "Datenbankfehler", error);
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json({ subunternehmer: subunternehmer || [] });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}

// POST /api/subunternehmer – Neuen Subunternehmer anlegen
export async function POST(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const { data: profil } = await supabase
      .from("benutzer_rollen")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!requireRoles(profil, "admin", "besteller")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const body = await request.json();
    const { firma, ansprechpartner, gewerk, telefon, email, email_absender, steuer_nr, iban, notizen } = body;

    if (!firma) {
      return NextResponse.json({ error: "Firma ist ein Pflichtfeld" }, { status: 400 });
    }

    if (!validateTextLength(firma, 200)) {
      return NextResponse.json({ error: "Firmenname zu lang (max. 200 Zeichen)" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("subunternehmer")
      .insert({
        firma,
        ansprechpartner: ansprechpartner || null,
        gewerk: gewerk || null,
        telefon: telefon || null,
        email: email || null,
        email_absender: email_absender || [],
        steuer_nr: steuer_nr || null,
        iban: iban || null,
        notizen: notizen || null,
        confirmed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      logError("/api/subunternehmer", "Datenbankfehler", error);
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json({ subunternehmer: data });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
