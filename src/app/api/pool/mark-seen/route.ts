import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";

/**
 * POST /api/pool/mark-seen
 *
 * Pool-2.0 Sprint 2: Bulk-Mark "gesehen" für IDs die der User über
 * IntersectionObserver scrollend wahrgenommen hat. Idempotent — wiederholte
 * Aufrufe für dieselben IDs sind no-op weil pool_user_state.seen_at via
 * COALESCE-OnConflict nicht überschrieben wird.
 *
 * Body: { ids: UUID[] } — max 200 (RPC hard-cap)
 */
const BodySchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
});

export async function POST(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const auth = await requireAuth(["admin", "besteller"]);
    if (auth.response) return auth.response;

    let body: z.infer<typeof BodySchema>;
    try {
      body = BodySchema.parse(await request.json());
    } catch {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    // Defensive UUID-Validation — vermeidet RPC-Errors bei korrupten Inputs
    const validIds = body.ids.filter(isValidUUID);
    if (validIds.length === 0) {
      return NextResponse.json({ success: true, marked: 0 });
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("pool_mark_seen", {
      p_bestellung_ids: validIds,
    });

    if (error) {
      logError("pool-mark-seen", "RPC fehlgeschlagen", { message: error.message });
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e) {
    logError("pool-mark-seen", "Unerwarteter Fehler", e);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
