import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";

const ERLAUBTE_FARBEN = ["#570006", "#2563eb", "#059669", "#d97706", "#7c3aed", "#0891b2"];

// PUT /api/projekte/[id] – Projekt bearbeiten
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

    if (!profil || (profil.rolle !== "admin" && profil.rolle !== "besteller")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const body = await request.json();
    const { name, beschreibung, kunde, farbe, budget, status, adresse, adresse_keywords } = body;

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (beschreibung !== undefined) updates.beschreibung = beschreibung?.trim() || null;
    if (kunde !== undefined) updates.kunde = kunde?.trim() || null;
    if (farbe !== undefined) updates.farbe = ERLAUBTE_FARBEN.includes(farbe) ? farbe : "#570006";
    if (budget !== undefined) updates.budget = budget ? Number(budget) : null;
    if (status !== undefined && ["aktiv", "abgeschlossen", "pausiert"].includes(status)) {
      updates.status = status;
    }
    if (adresse !== undefined) updates.adresse = typeof adresse === "string" ? adresse.trim() || null : null;
    if (adresse_keywords !== undefined && Array.isArray(adresse_keywords)) {
      updates.adresse_keywords = adresse_keywords.filter((k: unknown) => typeof k === "string" && k.trim().length > 0).map((k: string) => k.trim().toLowerCase());
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Keine Änderungen" }, { status: 400 });
    }

    const { data: projekt, error } = await supabase
      .from("projekte")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error || !projekt) {
      return NextResponse.json({ error: "Projekt nicht gefunden" }, { status: 404 });
    }

    // Denormalisierte Felder in bestellungen aktualisieren
    if (updates.name) {
      await supabase
        .from("bestellungen")
        .update({ projekt_name: updates.name as string })
        .eq("projekt_id", id);
    }

    return NextResponse.json({ projekt });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}

// DELETE /api/projekte/[id] – Projekt archivieren (soft delete)
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

    if (!profil || (profil.rolle !== "admin" && profil.rolle !== "besteller")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    // Prüfe ob Bestellungen zugeordnet sind
    const { count } = await supabase
      .from("bestellungen")
      .select("*", { count: "exact", head: true })
      .eq("projekt_id", id);

    if (count && count > 0) {
      // Soft-delete: archivieren statt löschen
      const { error } = await supabase
        .from("projekte")
        .update({ status: "archiviert" })
        .eq("id", id);

      if (error) {
        return NextResponse.json({ error: "Archivierung fehlgeschlagen" }, { status: 500 });
      }

      return NextResponse.json({ success: true, archiviert: true, grund: `Hat ${count} Bestellung${count > 1 ? "en" : ""}` });
    }

    // Keine Bestellungen → echtes Löschen
    const { error } = await supabase
      .from("projekte")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Löschen fehlgeschlagen" }, { status: 500 });
    }

    return NextResponse.json({ success: true, geloescht: true });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
