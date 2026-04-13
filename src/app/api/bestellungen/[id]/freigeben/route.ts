import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";

// POST /api/bestellungen/[id]/freigeben – Rechnung freigeben
export async function POST(
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

    const body = await request.json().catch(() => ({}));
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    // Benutzerprofil holen
    const { data: profil } = await supabase
      .from("benutzer_rollen")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!profil) {
      return NextResponse.json({ error: ERRORS.KEIN_PROFIL }, { status: 403 });
    }

    // Bestellung prüfen
    const { data: bestellung } = await supabase
      .from("bestellungen")
      .select("*")
      .eq("id", id)
      .single();

    if (!bestellung) {
      return NextResponse.json({ error: ERRORS.NICHT_GEFUNDEN }, { status: 404 });
    }

    // Nur Besteller der Bestellung oder Admin darf freigeben
    // SU/Abo: jeder Besteller darf freigeben (nicht an einen Besteller gebunden)
    const istSuOderAbo = bestellung.bestellungsart === "subunternehmer" || bestellung.bestellungsart === "abo";
    if (
      profil.rolle !== "admin" &&
      bestellung.besteller_kuerzel !== profil.kuerzel &&
      !istSuOderAbo
    ) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    // Bereits freigegeben? Duplikat verhindern
    if (bestellung.status === "freigegeben") {
      return NextResponse.json({ error: "Bestellung wurde bereits freigegeben" }, { status: 409 });
    }

    // Status ZUERST atomar setzen (Doppelklick-Schutz), DANN Freigabe-Eintrag erstellen
    // So gibt es keine orphaned Freigaben bei fehlgeschlagenem Status-Update
    const { error: updateError, count } = await supabase
      .from("bestellungen")
      .update({ status: "freigegeben", updated_at: new Date().toISOString() })
      .eq("id", id)
      .neq("status", "freigegeben");

    if (updateError || (count ?? 0) === 0) {
      logError("/api/bestellungen/[id]/freigeben", "Status-Update fehlgeschlagen oder bereits freigegeben", updateError);
      return NextResponse.json({ error: "Status konnte nicht aktualisiert werden" }, { status: 500 });
    }

    // Freigabe-Eintrag erstellen (Status ist bereits gesetzt)
    const { error: freigabeError } = await supabase
      .from("freigaben")
      .insert({
        bestellung_id: id,
        freigegeben_von_kuerzel: profil.kuerzel,
        freigegeben_von_name: profil.name,
        kommentar: body.kommentar || null,
      });

    if (freigabeError) {
      logError("/api/bestellungen/[id]/freigeben", "Freigabe-Eintrag fehlgeschlagen (Status bereits gesetzt)", freigabeError);
      // Status ist bereits korrekt gesetzt — Freigabe-Log fehlt aber ist nicht kritisch
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError("/api/bestellungen/[id]/freigeben", "Unerwarteter Fehler", err);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }
}
