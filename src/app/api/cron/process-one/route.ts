/**
 * Cron-Endpoint: Phase 2 der Fan-out-Architektur.
 *
 * Wird von pg_cron pro pending-Mail einmal aufgerufen (parallel-fan-out
 * via pg_net). Verarbeitet GENAU EINE Mail durch die volle Pipeline:
 * classify → Anhänge laden → ingest.
 *
 * Body: { internet_message_id: string }
 *
 * Auth: Bearer CRON_SECRET (oder MAKE_WEBHOOK_SECRET für Tests).
 *
 * Vorteile gegenüber Monolith-Orchestrator:
 * - Eigenes 60s-Lambda-Budget pro Mail (keine Cross-Contamination)
 * - Echte Parallelität (pg_cron fired N parallel)
 * - Failure einer Mail betrifft andere nicht
 * - Telemetrie pro Lambda präziser (eigene processed_at-Zeitstempel)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { replayOneMessage } from "@/lib/email-sync/replay";
import { logError, logInfo } from "@/lib/logger";
import { safeCompare } from "@/lib/safe-compare";
import { ERRORS } from "@/lib/errors";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const makeSecret = process.env.MAKE_WEBHOOK_SECRET;
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  if (cronSecret && safeCompare(bearer, cronSecret)) return true;
  if (makeSecret && safeCompare(bearer, makeSecret)) return true;
  return false;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
  }

  let body: { internet_message_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body muss JSON sein" }, { status: 400 });
  }

  const { internet_message_id } = body;
  if (!internet_message_id || typeof internet_message_id !== "string") {
    return NextResponse.json(
      { error: "internet_message_id ist Pflicht" },
      { status: 400 },
    );
  }

  try {
    const startTime = Date.now();
    // Manueller Replay-Modus: incrementRetryCount=false damit normale Discover→Process
    // nicht den Retry-Counter hochzählt (das macht nur der retry-failed-emails-Cron)
    const supabase = createServiceClient();
    const result = await replayOneMessage(supabase, internet_message_id, {
      incrementRetryCount: false,
    });
    logInfo("cron/process-one", "Mail verarbeitet", {
      internet_message_id,
      outcome: result.outcome,
      bestellung_id: result.bestellung_id,
      duration_ms: Date.now() - startTime,
    });
    return NextResponse.json({
      success: result.outcome !== "failed",
      outcome: result.outcome,
      bestellung_id: result.bestellung_id,
      fehler: result.fehler,
    });
  } catch (err) {
    logError("cron/process-one", `Process-Fehler bei ${internet_message_id}`, err);
    return NextResponse.json(
      {
        error: ERRORS.INTERNER_FEHLER,
        details: err instanceof Error ? err.message : null,
      },
      { status: 500 },
    );
  }
}
