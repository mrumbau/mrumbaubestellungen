import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";

/**
 * POST /api/bestellungen/[id]/pool-release-reservation
 *
 * Pool-2.0 Sprint 2 (03.06.2026): Reserve loslassen. Wird vom Drawer-
 * Cleanup oder via `navigator.sendBeacon` beim Tab-Close aufgerufen.
 * Idempotent — wenn ich nichts halte oder schon expired, no-op.
 *
 * Antwort: 200 { success, deleted: 0|1 }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // sendBeacon sendet keinen Origin-Header — CSRF-Check würde failen.
    // Da die RPC sowieso pro user_kuerzel scoped ist und keine destruktive
    // Wirkung hat (nur eigene Reserve löschen), akzeptieren wir das.
    if (!checkCsrf(request) && request.headers.get("content-type") !== "application/json;charset=UTF-8") {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }
    const { id } = await params;
    if (!isValidUUID(id)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    const auth = await requireAuth(["admin", "besteller"]);
    if (auth.response) return auth.response;

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("pool_release_reservation", {
      p_bestellung_id: id,
    });

    if (error) {
      logError("pool-release-reservation", "RPC fehlgeschlagen", {
        id,
        message: error.message,
      });
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e) {
    logError("pool-release-reservation", "Unerwarteter Fehler", e);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
