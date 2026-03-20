import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { requireRoles } from "@/lib/auth";

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

    if (!requireRoles(profil, "admin", "besteller")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const body = await request.json();
    const { name, beschreibung, kunde, kunden_id, farbe, budget } = body;

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json({ error: "Name muss mindestens 2 Zeichen lang sein" }, { status: 400 });
    }
    if (name.trim().length > 200) {
      return NextResponse.json({ error: "Name darf maximal 200 Zeichen lang sein" }, { status: 400 });
    }
    if (beschreibung && typeof beschreibung === "string" && beschreibung.trim().length > 2000) {
      return NextResponse.json({ error: "Beschreibung darf maximal 2000 Zeichen lang sein" }, { status: 400 });
    }
    if (kunden_id && !isValidUUID(kunden_id)) {
      return NextResponse.json({ error: "Ungültige Kunden-ID" }, { status: 400 });
    }

    // Kundenname aus kunden-Tabelle nachschlagen (für Denormalisierung)
    let kundenName = kunde?.trim() || null;
    if (kunden_id) {
      const { data: kundeRow } = await supabase
        .from("kunden")
        .select("name")
        .eq("id", kunden_id)
        .single();
      if (kundeRow) kundenName = kundeRow.name;
    }

    const safeFarbe = ERLAUBTE_FARBEN.includes(farbe) ? farbe : "#570006";

    const { data: projekt, error } = await supabase
      .from("projekte")
      .insert({
        name: name.trim(),
        beschreibung: beschreibung?.trim() || null,
        kunde: kundenName,
        kunden_id: kunden_id || null,
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
