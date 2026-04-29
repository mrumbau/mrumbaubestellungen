/**
 * Legacy-Endpoint — bleibt aus Backward-Compat-Gründen erhalten.
 *
 * Heute redirected er auf den neuen `discover-emails`-Pfad. Die eigentliche
 * Pipeline-Verarbeitung (classify + ingest) läuft seit der Fan-out-Migration
 * in `/api/cron/process-one`, getriggert von pg_cron.
 *
 * Wer das hier aufruft, bekommt nur die Discovery-Ergebnisse zurück. Damit
 * verarbeitete Mails sehen → process-one separat aufrufen lassen oder
 * pg_cron im Supabase-Dashboard checken.
 */

import { NextRequest, NextResponse } from "next/server";
import { runDiscover } from "@/lib/email-sync/discover";
import { logError, logInfo } from "@/lib/logger";
import { safeCompare } from "@/lib/safe-compare";
import { ERRORS } from "@/lib/errors";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// R1 Security-Hotfix: Make.com-Fallback entfernt. Diese Route ist ohnehin
// Legacy — pg_cron triggert jetzt /api/cron/discover-emails direkt.
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
    logInfo("cron/check-emails", "Legacy-Endpoint → Discover delegiert (DEPRECATED)", {
      claimed: result.total_messages_claimed,
      bootstrap_skipped: result.total_bootstrap_skipped,
      duration_ms: result.total_duration_ms,
    });
    // F3.E6: Deprecation- + Sunset-Header (RFC 8594/9745). Caller die diesen
    // Endpoint noch nutzen sehen das in den Response-Headern und können auf
    // /api/cron/discover-emails migrieren. Sunset 2026-12-31 (Make-Cutover-Puffer).
    return NextResponse.json(
      {
        ...result,
        deprecated: true,
        replacement: "/api/cron/discover-emails",
        sunset: "2026-12-31",
        note: "DEPRECATED: Endpoint wird zum 2026-12-31 entfernt. Bitte auf /api/cron/discover-emails umstellen.",
      },
      {
        headers: {
          Deprecation: "true",
          Sunset: "Thu, 31 Dec 2026 23:59:59 GMT",
          Link: "</api/cron/discover-emails>; rel=\"successor-version\"",
        },
      },
    );
  } catch (err) {
    logError("cron/check-emails", "Discover-Fehler", err);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER, details: err instanceof Error ? err.message : null },
      { status: 500 },
    );
  }
}
