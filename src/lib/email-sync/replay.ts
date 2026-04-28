/**
 * Geteilter Replay-Mechanismus.
 *
 * Wird von zwei Aufrufern genutzt:
 * 1. Manuelles Replay aus Admin-UI (/api/email-sync/log/:id/replay)
 * 2. Auto-Retry-Cron (/api/cron/retry-failed-emails)
 *
 * Holt eine bereits geloggten Mail erneut von Microsoft Graph,
 * lässt sie durch classify+ingest laufen und aktualisiert den Log-Status.
 *
 * Wirft NICHT — alle Fehler werden in den Log-Eintrag geschrieben (markFailed).
 * Caller bekommt strukturiertes Outcome zurück.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { graphFetch, GraphError } from "@/lib/microsoft-graph/client";
import { fetchAllFileAttachments } from "@/lib/microsoft-graph/attachments";
import { classifyEmail } from "@/lib/email-pipeline/classify";
import { ingestEmail } from "@/lib/email-pipeline/ingest";
import { markIrrelevant, markProcessed, markFailed } from "./idempotency";
import { logError } from "@/lib/logger";

export type ReplayOutcome = "processed" | "irrelevant" | "failed" | "gone";

export interface ReplayResult {
  outcome: ReplayOutcome;
  bestellung_id?: string;
  fehler?: string;
}

interface FullMessage {
  id: string;
  internetMessageId: string;
  receivedDateTime: string;
  subject: string;
  bodyPreview: string;
  body: { contentType: string; content: string };
  from: { emailAddress: { name?: string; address: string } } | null;
  hasAttachments: boolean;
}

/**
 * Versucht einen Log-Eintrag erneut durch die Pipeline zu schicken.
 * Aktualisiert Status, retry_count und last_retry_at via Side-Effect.
 *
 * @param supabase Service-Client (RLS-Bypass nötig)
 * @param internetMessageId PK des Log-Eintrags
 * @param incrementRetryCount true bei Auto-Retry-Cron, false bei manuellem Replay
 */
export async function replayOneMessage(
  supabase: SupabaseClient,
  internetMessageId: string,
  options: { incrementRetryCount?: boolean } = {},
): Promise<ReplayResult> {
  const { data: logEntry } = await supabase
    .from("email_processing_log")
    .select(
      "internet_message_id, graph_message_id, folder_id, mail_sync_folders!inner(document_hint)",
    )
    .eq("internet_message_id", internetMessageId)
    .single();

  if (!logEntry) {
    return { outcome: "failed", fehler: "log_eintrag_nicht_gefunden" };
  }

  const folderHint =
    (logEntry as unknown as { mail_sync_folders?: { document_hint?: string | null } })
      .mail_sync_folders?.document_hint ?? null;
  const graphMessageId = logEntry.graph_message_id;

  // Retry-Counter optimistisch erhöhen vor Pipeline-Call,
  // damit selbst bei Crash der Counter steigt und endlose Retries vermieden werden
  if (options.incrementRetryCount) {
    await supabase
      .from("email_processing_log")
      .update({
        retry_count: ((logEntry as { retry_count?: number }).retry_count ?? 0) + 1,
        last_retry_at: new Date().toISOString(),
      })
      .eq("internet_message_id", internetMessageId);
  }

  const mailbox = encodeURIComponent(process.env.MS_MAILBOX ?? "");
  if (!mailbox) {
    await markFailed(supabase, internetMessageId, "MS_MAILBOX nicht gesetzt");
    return { outcome: "failed", fehler: "MS_MAILBOX nicht gesetzt" };
  }

  let message: FullMessage;
  try {
    message = await graphFetch<FullMessage>(
      `/users/${mailbox}/messages/${encodeURIComponent(graphMessageId)}?$select=id,internetMessageId,receivedDateTime,subject,bodyPreview,body,from,hasAttachments`,
      { headers: { Prefer: 'outlook.body-content-type="text"' } },
    );
  } catch (err) {
    if (err instanceof GraphError && err.status === 404) {
      await markFailed(
        supabase,
        internetMessageId,
        "mail_in_outlook_geloescht_oder_verschoben",
      );
      return { outcome: "gone", fehler: "Mail in Outlook nicht mehr verfügbar" };
    }
    logError("email-sync/replay", "Graph-Fehler", err);
    const msg = err instanceof Error ? err.message : "graph_fehler";
    await markFailed(supabase, internetMessageId, msg);
    return { outcome: "failed", fehler: msg };
  }

  try {
    const classifyResult = await classifyEmail({
      email_absender: message.from?.emailAddress.address ?? "",
      email_betreff: message.subject ?? "",
      email_vorschau: message.bodyPreview ?? "",
      hat_anhaenge: message.hasAttachments,
    });

    if (!classifyResult.relevant) {
      await markIrrelevant(supabase, internetMessageId, classifyResult.grund);
      return { outcome: "irrelevant" };
    }

    const attachments = message.hasAttachments
      ? await fetchAllFileAttachments(message.id)
      : [];

    const ingestResult = await ingestEmail({
      email_absender: message.from?.emailAddress.address ?? "",
      email_betreff: message.subject ?? "",
      email_datum: message.receivedDateTime,
      email_text: message.body?.content ?? "",
      email_vorschau: message.bodyPreview ?? "",
      vorfilter: "ja",
      haendler_id: classifyResult.haendler_id,
      haendler_name: classifyResult.haendler_name,
      su_id: classifyResult.su_id,
      bestellnummer_betreff: classifyResult.bestellnummer_betreff,
      anhaenge: attachments,
      document_hint: folderHint,
    });

    if (!ingestResult.success) {
      await markFailed(
        supabase,
        internetMessageId,
        ingestResult.fehler ?? "ingest_fehlgeschlagen",
      );
      return { outcome: "failed", fehler: ingestResult.fehler };
    }

    await markProcessed(supabase, internetMessageId, {
      bestellung_id: ingestResult.bestellung_id,
      ki_classified_as: ingestResult.dokument_typ,
      ki_confidence: ingestResult.ki_confidence,
      parser_source: ingestResult.parser_source,
      parser_name: ingestResult.parser_name,
    });

    return { outcome: "processed", bestellung_id: ingestResult.bestellung_id };
  } catch (err) {
    logError("email-sync/replay", "Replay-Pipeline-Fehler", err);
    const msg = err instanceof Error ? err.message : "unbekannter_fehler";
    await markFailed(supabase, internetMessageId, msg);
    return { outcome: "failed", fehler: msg };
  }
}
