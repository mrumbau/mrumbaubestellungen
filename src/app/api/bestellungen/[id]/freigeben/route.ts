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

    // Atomare Freigabe via RPC: Status-Update + Freigabe-Insert in einer Transaktion.
    // Unique Constraint auf freigaben(bestellung_id) verhindert Duplikate bei Doppelklick.
    const { data: rpcResult, error: rpcError } = await supabase.rpc("freigeben_bestellung", {
      p_bestellung_id: id,
      p_kuerzel: profil.kuerzel,
      p_name: profil.name,
      p_kommentar: body.kommentar || null,
    });

    if (rpcError) {
      logError("/api/bestellungen/[id]/freigeben", "Freigabe-RPC fehlgeschlagen", rpcError);
      return NextResponse.json({ error: "Freigabe konnte nicht durchgeführt werden" }, { status: 500 });
    }

    if (rpcResult?.success === false) {
      if (rpcResult.error === "bereits_freigegeben") {
        return NextResponse.json({ error: "Bestellung wurde bereits freigegeben" }, { status: 409 });
      }
      logError("/api/bestellungen/[id]/freigeben", "Freigabe-RPC Fehler", rpcResult);
      return NextResponse.json({ error: "Freigabe fehlgeschlagen" }, { status: 500 });
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
