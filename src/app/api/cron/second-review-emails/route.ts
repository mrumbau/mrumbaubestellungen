/**
 * Vercel-Cron Endpoint: stündlich. Findet "Silent Drops" der letzten 7 Tage
 * (Mails mit Anhängen die keine Bestellung erzeugt haben) und lässt einen
 * adversarialen 2. KI-Pass drüberlaufen. Bei "vermutlich doch ein Dokument"
 * wird die Pipeline neu getriggert (Graph-Refetch + Re-Run).
 *
 * Auth: Bearer CRON_SECRET (analog retry-failed-emails).
 *
 * Idempotenz: pro Mail max 1× re-reviewed (second_review_at-Spalte als Lock).
 *
 * Kosten: ~$0.001-0.002/Mail × ~5-20 Mails/Tag = vernachlässigbar.
 *
 * 22.05.2026 — User-Request: generisch statt vendor-spezifischer Parser.
 */

import { NextRequest, NextResponse } from "next/server";
import { runSecondReviewCron } from "@/lib/email-sync/second-review-runner";
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
    const result = await runSecondReviewCron();
    logInfo("cron/second-review-emails", "Run abgeschlossen", { ...result });
    return NextResponse.json(result);
  } catch (err) {
    logError("cron/second-review-emails", "Cron-Run-Fehler", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "internal_error" },
      { status: 500 },
    );
  }
}
