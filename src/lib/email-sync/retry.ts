/**
 * Auto-Retry für 'failed' Mails.
 *
 * Wird stündlich per Cron aufgerufen. Holt Mails die in den letzten 24 Stunden
 * als 'failed' markiert wurden und retry_count < MAX_RETRIES haben, und
 * versucht sie erneut durch die Pipeline zu jagen.
 *
 * Use Cases die das adressiert:
 * - OpenAI 5xx-Outage (5–30 min): Mails fallen in 'failed', kommen aber nach
 *   nächstem Retry durch
 * - Microsoft Graph 429 Throttling: temporär nicht erreichbar
 * - Vercel-Cold-Start-Timeout: Lambda lief in 60s, Pipeline wurde abgebrochen
 *
 * Schutzmaßnahmen:
 * - Max 3 Retries pro Mail (danach permanent failed)
 * - Pro Cron-Tick max 10 Mails (verhindert Vercel-Timeout bei großem Backlog)
 * - Mails > 24h alt werden nicht mehr retried (alte Failures sind meist
 *   strukturell, nicht transient)
 * - retry_count wird VOR Pipeline-Call hochgezählt → Crash bumpt trotzdem
 */

import { createServiceClient } from "@/lib/supabase";
import { logInfo, logError } from "@/lib/logger";
import { replayOneMessage } from "./replay";

const MAX_RETRIES = 3;
const MAX_BATCH_SIZE = 10;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_RUN_MS = 50_000;

export interface RetryResult {
  candidates: number;
  attempted: number;
  succeeded: number;
  irrelevant: number;
  still_failed: number;
  gone: number;
  duration_ms: number;
  truncated: boolean;
}

export async function runRetryFailedEmails(): Promise<RetryResult> {
  const startTime = Date.now();
  const supabase = createServiceClient();
  const cutoffIso = new Date(Date.now() - MAX_AGE_MS).toISOString();

  const { data: candidates, error } = await supabase
    .from("email_processing_log")
    .select("internet_message_id, retry_count")
    .eq("status", "failed")
    .lt("retry_count", MAX_RETRIES)
    .gte("created_at", cutoffIso)
    // Älteste retries zuerst — die haben die meiste Zeit gewartet
    .order("last_retry_at", { ascending: true, nullsFirst: true })
    .limit(MAX_BATCH_SIZE);

  if (error) {
    throw new Error(`Retry-Kandidaten-Query fehlgeschlagen: ${error.message}`);
  }

  const result: RetryResult = {
    candidates: candidates?.length ?? 0,
    attempted: 0,
    succeeded: 0,
    irrelevant: 0,
    still_failed: 0,
    gone: 0,
    duration_ms: 0,
    truncated: false,
  };

  if (!candidates || candidates.length === 0) {
    result.duration_ms = Date.now() - startTime;
    return result;
  }

  for (const c of candidates) {
    if (Date.now() - startTime > MAX_RUN_MS) {
      result.truncated = true;
      break;
    }
    result.attempted++;

    try {
      const outcome = await replayOneMessage(supabase, c.internet_message_id, {
        incrementRetryCount: true,
      });
      if (outcome.outcome === "processed") result.succeeded++;
      else if (outcome.outcome === "irrelevant") result.irrelevant++;
      else if (outcome.outcome === "gone") result.gone++;
      else result.still_failed++;
    } catch (err) {
      // replayOneMessage sollte selbst nichts werfen, aber Defense-in-Depth
      result.still_failed++;
      logError("email-sync/retry", `Replay throw bei ${c.internet_message_id}`, err);
    }
  }

  result.duration_ms = Date.now() - startTime;

  if (result.attempted > 0) {
    logInfo("email-sync/retry", "Retry-Run abgeschlossen", { ...result });
  }

  return result;
}
