/**
 * Vercel-Cron Endpoint: alle 2 min via vercel.json gescheduled.
 * Auth: Bearer-Header CRON_SECRET (Vercel setzt den automatisch bei Cron-Triggern)
 *       ODER MAKE_WEBHOOK_SECRET (für manuelle/lokale Aufrufe via curl).
 *
 * Triggert den Orchestrator. Antwort: kompakte Zusammenfassung für Vercel-Logs.
 */

import { NextRequest, NextResponse } from "next/server";
import { runOrchestrator } from "@/lib/email-sync/orchestrator";
import { logError, logInfo } from "@/lib/logger";
import { safeCompare } from "@/lib/safe-compare";
import { ERRORS } from "@/lib/errors";

export const maxDuration = 60;
// Wichtig: nicht statisch generieren, läuft nur per Cron-Trigger
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
    const result = await runOrchestrator();
    logInfo("cron/check-emails", "Cron-Run abgeschlossen", {
      folders: result.total_folders,
      processed: result.total_messages_processed,
      skipped: result.total_messages_skipped,
      failed: result.total_messages_failed,
      duration_ms: result.total_duration_ms,
      truncated: result.truncated,
    });
    return NextResponse.json(result);
  } catch (err) {
    logError("cron/check-emails", "Orchestrator-Fehler", err);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER, details: err instanceof Error ? err.message : null },
      { status: 500 },
    );
  }
}
