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

  // 06.05.2026 — Per-Mail-Eskalation: Mails die jetzt MAX_RETRIES erreicht haben
  // bekommen einen webhook_logs-Eintrag damit Admin in /einstellungen/system/logs
  // sieht welche Mails dauerhaft failed sind. Dedup via internet_message_id —
  // pro Mail nur ein Alert.
  await escalatePermanentFailures(supabase);

  return result;
}

async function escalatePermanentFailures(supabase: ReturnType<typeof createServiceClient>): Promise<void> {
  try {
    // Mails die MAX_RETRIES erreicht haben innerhalb der letzten 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: terminallyFailed } = await supabase
      .from("email_processing_log")
      .select("internet_message_id, subject, sender, error_msg, retry_count")
      .eq("status", "failed")
      .gte("retry_count", MAX_RETRIES)
      .gte("last_retry_at", since)
      .limit(20);

    if (!terminallyFailed || terminallyFailed.length === 0) return;

    // Welche haben schon einen Alert?
    const { data: existing } = await supabase
      .from("webhook_logs")
      .select("fehler_text")
      .eq("typ", "retry_max")
      .gte("created_at", since)
      .limit(50);

    const alertedIds = new Set(
      (existing || [])
        .map((r) => /\[mid=([^\]]+)\]/.exec(r.fehler_text ?? "")?.[1])
        .filter(Boolean) as string[],
    );

    for (const m of terminallyFailed) {
      if (alertedIds.has(m.internet_message_id)) continue;

      const subject = (m.subject ?? "").slice(0, 100);
      const sender = m.sender ?? "?";
      const errMsg = (m.error_msg ?? "kein Detail").slice(0, 200);

      await supabase.from("webhook_logs").insert({
        typ: "retry_max",
        status: "error",
        fehler_text:
          `Mail erreichte ${MAX_RETRIES} Retries ohne Erfolg [mid=${m.internet_message_id}]. ` +
          `Subject: "${subject}" · Absender: ${sender} · Letzter Fehler: ${errMsg}`,
      });

      logInfo("email-sync/retry", "Permanent-Failure Alert geloggt", {
        internet_message_id: m.internet_message_id,
        subject,
        sender,
      });
    }
  } catch (err) {
    // Eskalation-Fehler darf den Retry-Cron nicht failen lassen
    logError("email-sync/retry", "Eskalation fehlgeschlagen (fail-open)", err);
  }
}
