/**
 * Cron-Endpoint: Phase 1 der Fan-out-Architektur.
 *
 * Wird von pg_cron alle 2 Min getriggert. Liest neue Mails per
 * Microsoft Graph Delta und schreibt sie als 'pending' in die DB.
 * KEINE Pipeline-Verarbeitung — die läuft isoliert in /api/cron/process-one.
 *
 * Auth: Bearer-Header CRON_SECRET. Wird von pg_cron via Supabase-Vault
 * gesetzt — in Produktion ausschließlich. Make.com-Fallback wurde entfernt
 * (R1 Security-Hotfix), weil das Make-Secret als Zweit-Schlüssel ein
 * Privilege-Escalation-Vektor war.
 */

import { NextRequest, NextResponse } from "next/server";
import { runDiscover } from "@/lib/email-sync/discover";
import { logError, logInfo } from "@/lib/logger";
import { safeCompare } from "@/lib/safe-compare";
import { ERRORS } from "@/lib/errors";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  return safeCompare(bearer, cronSecret);
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
    const result = await runDiscover();
    logInfo("cron/discover-emails", "Discover abgeschlossen", {
      folders: result.total_folders,
      claimed: result.total_messages_claimed,
      bootstrap_skipped: result.total_bootstrap_skipped,
      duration_ms: result.total_duration_ms,
      truncated: result.truncated,
    });
    return NextResponse.json(result);
  } catch (err) {
    logError("cron/discover-emails", "Discover-Fehler", err);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER, details: err instanceof Error ? err.message : null },
      { status: 500 },
    );
  }
}
