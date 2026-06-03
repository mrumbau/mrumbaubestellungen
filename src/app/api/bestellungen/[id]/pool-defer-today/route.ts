import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";

/**
 * POST /api/bestellungen/[id]/pool-defer-today
 *
 * Pool-2.0 Sprint 2 (03.06.2026): Item bleibt im Pool sichtbar, aber
 * sortiert ans Ende mit "Nicht heute"-Pill. Cron resettet jeden Morgen
 * (pool_defer_reset @ 23:00 UTC).
 *
 * Body: { undo?: boolean } — wenn true, Defer-Flag entfernen
 */
const BodySchema = z.object({ undo: z.boolean().optional() });

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

    let body: z.infer<typeof BodySchema> = {};
    try {
      const json = await request.json();
      body = BodySchema.parse(json);
    } catch {
      // empty body → defer
    }

    const supabase = await createServerSupabaseClient();
    const rpc = body.undo
      ? supabase.rpc("pool_undefer", { p_bestellung_id: id })
      : supabase.rpc("pool_defer_today", { p_bestellung_id: id });

    const { data, error } = await rpc;
    if (error) {
      logError("pool-defer-today", "RPC fehlgeschlagen", { id, message: error.message });
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (e) {
    logError("pool-defer-today", "Unerwarteter Fehler", e);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
