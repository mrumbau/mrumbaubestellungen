import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID, validateTextLength } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { requireRoles } from "@/lib/auth";
import { logError } from "@/lib/logger";

// PUT /api/subunternehmer/[id] – Subunternehmer aktualisieren
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const { id } = await params;
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

    if (!isValidUUID(id)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
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
      .update({
        firma,
        ansprechpartner: ansprechpartner || null,
        gewerk: gewerk || null,
        telefon: telefon || null,
        email: email || null,
        email_absender: email_absender || [],
        steuer_nr: steuer_nr || null,
        iban: iban || null,
        notizen: notizen || null,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      logError("/api/subunternehmer/[id]", "Datenbankfehler", error);
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json({ subunternehmer: data });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}

// DELETE /api/subunternehmer/[id] – Subunternehmer löschen
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const { id } = await params;
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

    if (!isValidUUID(id)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    const { error } = await supabase.from("subunternehmer").delete().eq("id", id);

    if (error) {
      if (error.code === "23503") {
        return NextResponse.json({ error: "Subunternehmer kann nicht gelöscht werden, da noch Bestellungen zugeordnet sind." }, { status: 409 });
      }
      logError("/api/subunternehmer/[id]", "Datenbankfehler", error);
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
