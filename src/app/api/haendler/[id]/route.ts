import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID, isValidDomain, validateTextLength } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";

// PUT /api/haendler/[id] – Händler aktualisieren
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

    if (!profil || profil.rolle !== "admin") {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    if (!isValidUUID(id)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    const body = await request.json();
    const { name, domain, url_muster, email_absender } = body;

    if (name && !validateTextLength(name, 200)) {
      return NextResponse.json({ error: "Name zu lang (max. 200 Zeichen)" }, { status: 400 });
    }

    if (domain && !isValidDomain(domain)) {
      return NextResponse.json({ error: "Ungültige Domain" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("haendler")
      .update({
        name,
        domain,
        url_muster: url_muster || [],
        email_absender: email_absender || [],
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Händler Fehler:", error);
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json({ haendler: data });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}

// DELETE /api/haendler/[id] – Händler löschen
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

    if (!profil || profil.rolle !== "admin") {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    if (!isValidUUID(id)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    const { error } = await supabase.from("haendler").delete().eq("id", id);

    if (error) {
      console.error("Händler Fehler:", error);
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
