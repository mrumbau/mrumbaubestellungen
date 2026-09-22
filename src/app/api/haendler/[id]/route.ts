import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID, isValidDomain, validateTextLength } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { requireRoles } from "@/lib/auth";
import { logError } from "@/lib/logger";

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

    if (!requireRoles(profil, "admin", "besteller")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    if (!isValidUUID(id)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    const body = await request.json();
    const {
      name, domain, url_muster, email_absender,
      immer_vorausbezahlt, zahlungsziel_tage,
    } = body;

    if (name && !validateTextLength(name, 200)) {
      return NextResponse.json({ error: "Name zu lang (max. 200 Zeichen)" }, { status: 400 });
    }

    if (domain && !isValidDomain(domain)) {
      return NextResponse.json({ error: "Ungültige Domain" }, { status: 400 });
    }

    // 21.09.2026 — Zahlungsziel. null loescht den Wert (= unbekannt, dann
    // bleibt die Faelligkeit leer). Obergrenze 365 Tage: alles darueber ist
    // in der Praxis ein Tippfehler, und ein falsches Faelligkeitsdatum ist
    // schaedlicher als gar keins.
    const zahlungszielGesetzt = zahlungsziel_tage !== undefined && zahlungsziel_tage !== null;
    if (zahlungszielGesetzt) {
      const tage = Number(zahlungsziel_tage);
      if (!Number.isInteger(tage) || tage < 0 || tage > 365) {
        return NextResponse.json(
          { error: "Zahlungsziel muss eine ganze Zahl zwischen 0 und 365 Tagen sein" },
          { status: 400 },
        );
      }
    }

    if (immer_vorausbezahlt !== undefined && typeof immer_vorausbezahlt !== "boolean") {
      return NextResponse.json(
        { error: "„Immer vorausbezahlt“ muss ja oder nein sein" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("haendler")
      .update({
        name,
        domain,
        url_muster: url_muster || [],
        email_absender: email_absender || [],
        ...(immer_vorausbezahlt !== undefined ? { immer_vorausbezahlt } : {}),
        ...(zahlungsziel_tage !== undefined
          ? { zahlungsziel_tage: zahlungszielGesetzt ? Number(zahlungsziel_tage) : null }
          : {}),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      logError("/api/haendler/[id]", "Datenbankfehler", error);
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

    if (!requireRoles(profil, "admin", "besteller")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    if (!isValidUUID(id)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    const { error } = await supabase.from("haendler").delete().eq("id", id);

    if (error) {
      logError("/api/haendler/[id]", "Datenbankfehler", error);
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
