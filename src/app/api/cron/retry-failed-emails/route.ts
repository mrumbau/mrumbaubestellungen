/**
 * Vercel-Cron Endpoint: stündlich. Holt 'failed' Mails der letzten 24h
 * und versucht sie erneut durch die Pipeline zu schicken.
 *
 * Auth: Bearer-Header CRON_SECRET (Vercel-Cron) ODER MAKE_WEBHOOK_SECRET (manuell).
 *
 * Verhalten:
 * - Pro Tick max 10 Mails (Vercel-60s-Schutz)
 * - Pro Mail max 3 Retries (danach permanent failed)
 * - Mails > 24h alt werden ignoriert (alte Failures sind meist strukturell)
 * - Bei systematischem Failure (alle Retries failen) → webhook_logs.error
 *   für Admin-Sichtbarkeit
 */

import { NextRequest, NextResponse } from "next/server";
import { runRetryFailedEmails } from "@/lib/email-sync/retry";
import { createServiceClient } from "@/lib/supabase";
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

export async function GET(request: NextRequest) {
  return runCron(request);
}

export async function POST(request: NextRequest) {
  return runCron(request);
}

async function runCron(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
  }

  try {
    const result = await runRetryFailedEmails();
    logInfo("cron/retry-failed-emails", "Retry-Run abgeschlossen", { ...result });

    // Alert: wenn alles failed (mehr als 3 Mails attempted, alle still_failed/gone)
    // → das deutet auf systematisches Problem hin
    if (result.attempted >= 3 && result.succeeded === 0 && result.still_failed >= 3) {
      try {
        const sb = createServiceClient();
        await sb.from("webhook_logs").insert({
          typ: "cron",
          status: "error",
          fehler_text: `Auto-Retry: ${result.attempted} Versuche, 0 Erfolge, ${result.still_failed} weiter failed. Möglicher systematischer Fehler (OpenAI-Outage, Graph-Down, Bug). Im Email-Sync-Monitor checken.`,
        });
      } catch { /* Alert-Fehler nicht eskalieren */ }
    }

    return NextResponse.json(result);
  } catch (err) {
    logError("cron/retry-failed-emails", "Retry-Run-Fehler", err);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER, details: err instanceof Error ? err.message : null },
      { status: 500 },
    );
  }
}
