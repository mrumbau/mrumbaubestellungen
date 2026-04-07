import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID, isValidDomain, validateTextLength } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { requireRoles } from "@/lib/auth";
import { logError } from "@/lib/logger";

// PUT /api/abo-anbieter/[id] – Abo-Anbieter aktualisieren
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

    if (!requireRoles(profil, "admin")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    if (!isValidUUID(id)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    const body = await request.json();
    const { name, domain, email_absender, notizen, intervall, erwarteter_betrag, toleranz_prozent, naechste_rechnung, vertragsbeginn, vertragsende, kuendigungsfrist_tage } = body;

    if (name && !validateTextLength(name, 200)) {
      return NextResponse.json({ error: "Name zu lang (max. 200 Zeichen)" }, { status: 400 });
    }

    if (domain && !isValidDomain(domain)) {
      return NextResponse.json({ error: "Ungültige Domain" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("abo_anbieter")
      .update({
        name,
        domain,
        email_absender: email_absender || [],
        notizen: notizen || null,
        intervall: intervall || "monatlich",
        erwarteter_betrag: erwarteter_betrag || null,
        toleranz_prozent: toleranz_prozent ?? 10,
        naechste_rechnung: naechste_rechnung || null,
        vertragsbeginn: vertragsbeginn || null,
        vertragsende: vertragsende || null,
        kuendigungsfrist_tage: kuendigungsfrist_tage || null,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      logError("/api/abo-anbieter/[id]", "Datenbankfehler", error);
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json({ abo_anbieter: data });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}

// DELETE /api/abo-anbieter/[id] – Abo-Anbieter löschen
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

    if (!requireRoles(profil, "admin")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    if (!isValidUUID(id)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    const { error } = await supabase.from("abo_anbieter").delete().eq("id", id);

    if (error) {
      logError("/api/abo-anbieter/[id]", "Datenbankfehler", error);
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
