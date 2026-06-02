import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";

/**
 * POST /api/bestellungen/[id]/pool-claim
 *
 * Pool-Phase-1 (02.06.2026): Aktueller User übernimmt eine UNBEKANNT-Material-
 * Bestellung. Idempotent + race-safe via `pool_claim_bestellung`-RPC.
 *
 * Die RPC läuft als SECURITY DEFINER mit `auth.uid()` aus der User-Session
 * (Server-Supabase-Client) und verifiziert intern Rolle, Bestellungsart und
 * den UNBEKANNT-Vorzustand. Bei Race-Verlust kommt `was_already_claimed=true`
 * + `current_owner` zurück — die UI rendert daraus den "Wurde gerade von X
 * übernommen"-Toast.
 *
 * Antwort-Schema (kanonisch für beide Pool-Routes):
 *   200 { success:true,  claimed_by_kuerzel, claimed_by_name }
 *   200 { success:false, was_already_claimed:true, current_owner, message } — Race-Verlust
 *   400 { error }  — Validation
 *   401/403 { error } — Auth/Rolle
 *   500 { error } — RPC-Fehler
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const { id } = await params;
    if (!isValidUUID(id)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    const auth = await requireAuth(["admin", "besteller"]);
    if (auth.response) return auth.response;

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("pool_claim_bestellung", {
      p_bestellung_id: id,
    });

    if (error) {
      logError("pool-claim", "RPC fehlgeschlagen", { id, message: error.message });
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    // RPC liefert immer ein JSONB-Objekt mit success-Flag.
    return NextResponse.json(data);
  } catch (e) {
    logError("pool-claim", "Unerwarteter Fehler", e);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
