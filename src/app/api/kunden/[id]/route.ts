import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";

const ERLAUBTE_FARBEN = ["#570006", "#2563eb", "#059669", "#d97706", "#7c3aed", "#0891b2"];

// PUT /api/kunden/[id] – Kunde bearbeiten
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const { id } = await params;
    if (!isValidUUID(id)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
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
    const { name, kuerzel, adresse, email, telefon, notizen, keywords, farbe } = body;

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name?.trim() || null;
    if (kuerzel !== undefined) updates.kuerzel = kuerzel?.trim() || null;
    if (adresse !== undefined) updates.adresse = adresse?.trim() || null;
    if (email !== undefined) updates.email = email?.trim() || null;
    if (telefon !== undefined) updates.telefon = telefon?.trim() || null;
    if (notizen !== undefined) updates.notizen = notizen?.trim() || null;
    if (keywords !== undefined) {
      updates.keywords = Array.isArray(keywords)
        ? keywords.filter((k: unknown) => typeof k === "string" && k.trim().length > 0).map((k: string) => k.trim().toLowerCase())
        : [];
    }
    if (farbe !== undefined) updates.farbe = ERLAUBTE_FARBEN.includes(farbe) ? farbe : "#2563eb";

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Keine Änderungen" }, { status: 400 });
    }

    const { data: kunde, error } = await supabase
      .from("kunden")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error || !kunde) {
      return NextResponse.json({ error: "Kunde nicht gefunden" }, { status: 404 });
    }

    return NextResponse.json({ kunde });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}

// DELETE /api/kunden/[id] – Kunde löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const { id } = await params;
    if (!isValidUUID(id)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
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

    // Prüfe ob Projekte oder Bestellungen zugeordnet sind
    const { count: projektCount } = await supabase
      .from("projekte")
      .select("*", { count: "exact", head: true })
      .eq("kunden_id", id);

    const { count: bestellungCount } = await supabase
      .from("bestellungen")
      .select("*", { count: "exact", head: true })
      .eq("kunden_id", id);

    if ((projektCount && projektCount > 0) || (bestellungCount && bestellungCount > 0)) {
      return NextResponse.json({
        error: `Kunde hat ${projektCount || 0} Projekt(e) und ${bestellungCount || 0} Bestellung(en). Bitte zuerst Zuordnungen entfernen.`,
      }, { status: 409 });
    }

    const { error } = await supabase
      .from("kunden")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Löschen fehlgeschlagen" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
