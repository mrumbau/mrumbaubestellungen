import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";

/**
 * POST /api/bestellungen/[id]/pool-snooze
 *
 * Pool-2.0 Sprint 2 (03.06.2026): Pool-Item für mich ausblenden bis
 * `until`. Wenn `until` weggelassen wird, ist's ein un-snooze (Snooze
 * sofort aufheben — Item taucht wieder im Pool auf).
 *
 * Body: { until?: ISO-String, reason?: string (≤200) }
 */
const BodySchema = z.object({
  until: z.string().datetime({ offset: true }).optional(),
  reason: z.string().max(200).optional(),
});

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

    let body: z.infer<typeof BodySchema>;
    try {
      const json = await request.json();
      body = BodySchema.parse(json);
    } catch {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const rpc = body.until
      ? supabase.rpc("pool_snooze", {
          p_bestellung_id: id,
          p_until: body.until,
          p_reason: body.reason ?? undefined,
        })
      : supabase.rpc("pool_unsnooze", { p_bestellung_id: id });

    const { data, error } = await rpc;
    if (error) {
      logError("pool-snooze", "RPC fehlgeschlagen", { id, message: error.message });
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (e) {
    logError("pool-snooze", "Unerwarteter Fehler", e);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
