import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { requireRoles } from "@/lib/auth";

const ERLAUBTE_FARBEN = ["#570006", "#2563eb", "#059669", "#d97706", "#7c3aed", "#0891b2"];

// GET /api/kunden – Alle Kunden laden
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const { data: kunden, error } = await supabase
      .from("kunden")
      .select("*")
      .order("name");

    if (error) {
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json({ kunden: kunden || [] });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}

// POST /api/kunden – Neuer Kunde anlegen (admin-only)
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
    const { name, kuerzel, adresse, email, telefon, notizen, keywords, farbe } = body;

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json({ error: "Name muss mindestens 2 Zeichen lang sein" }, { status: 400 });
    }

    const safeFarbe = ERLAUBTE_FARBEN.includes(farbe) ? farbe : "#2563eb";
    const safeKeywords = Array.isArray(keywords)
      ? keywords.filter((k: unknown) => typeof k === "string" && k.trim().length > 0).map((k: string) => k.trim().toLowerCase())
      : [];

    const { data: kunde, error } = await supabase
      .from("kunden")
      .insert({
        name: name.trim(),
        kuerzel: kuerzel?.trim() || null,
        adresse: adresse?.trim() || null,
        email: email?.trim() || null,
        telefon: telefon?.trim() || null,
        notizen: notizen?.trim() || null,
        keywords: safeKeywords,
        farbe: safeFarbe,
        confirmed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Kunde konnte nicht erstellt werden" }, { status: 500 });
    }

    return NextResponse.json({ kunde }, { status: 201 });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
