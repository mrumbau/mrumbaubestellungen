import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";

const ERLAUBTE_FARBEN = ["#570006", "#2563eb", "#059669", "#d97706", "#7c3aed", "#0891b2"];

// GET /api/projekte – Alle Projekte laden
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const { data: projekte, error } = await supabase
      .from("projekte")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json({ projekte: projekte || [] });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}

// POST /api/projekte – Neues Projekt anlegen
export async function POST(request: NextRequest) {
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
    const { name, beschreibung, kunde, farbe, budget } = body;

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json({ error: "Name muss mindestens 2 Zeichen lang sein" }, { status: 400 });
    }

    const safeFarbe = ERLAUBTE_FARBEN.includes(farbe) ? farbe : "#570006";

    const { data: projekt, error } = await supabase
      .from("projekte")
      .insert({
        name: name.trim(),
        beschreibung: beschreibung?.trim() || null,
        kunde: kunde?.trim() || null,
        farbe: safeFarbe,
        budget: budget ? Number(budget) : null,
        erstellt_von: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Projekt konnte nicht erstellt werden" }, { status: 500 });
    }

    return NextResponse.json({ projekt }, { status: 201 });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
