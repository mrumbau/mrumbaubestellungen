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
import { withCostTracking } from "@/lib/openai";
import { markIrrelevant, markProcessed, markFailed } from "./idempotency";
import { logError, logInfo } from "@/lib/logger";

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

  // F3.B2 Fix: SQL-side Atomic-Inkrement statt Read-Modify-Write Race.
  // Bei zwei parallelen Retries (manuell + Cron) wird der Counter nun korrekt
  // hochgezählt statt potentiell zurückgesetzt.
  if (options.incrementRetryCount) {
    await supabase.rpc("increment_email_retry_count", {
      p_internet_message_id: internetMessageId,
    });
  }

  // F3.B4 Fix: einheitlicher Pfad — mailbox wird hart angefordert, fail-fast
  // bei Env-Lücke (R3a env.ts validiert schon beim Boot, hier Defense-in-Depth).
  let mailbox: string;
  try {
    mailbox = encodeURIComponent(process.env.MS_MAILBOX ?? "");
    if (!mailbox) throw new Error("MS_MAILBOX nicht gesetzt");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "MS_MAILBOX nicht gesetzt";
    await markFailed(supabase, internetMessageId, msg);
    return { outcome: "failed", fehler: msg };
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

  // R5c: Komplette Pipeline (classify + ingest) in withCostTracking-Bucket
  // → AsyncLocalStorage-Bucket fließt durch alle OpenAI-Calls und wird in
  // markProcessed in email_processing_log.openai_* persistiert.
  try {
    const { result, cost } = await withCostTracking(async () => {
      const classifyResult = await classifyEmail({
        email_absender: message.from?.emailAddress.address ?? "",
        email_betreff: message.subject ?? "",
        email_vorschau: message.bodyPreview ?? "",
        hat_anhaenge: message.hasAttachments,
      });

      if (!classifyResult.relevant) {
        return {
          outcome: "irrelevant" as const,
          grund: classifyResult.grund,
        };
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

      return { outcome: "ingested" as const, ingestResult };
    });

    if (cost.calls > 0) {
      logInfo("email-sync/replay", "Cost-Bucket aggregiert", {
        internet_message_id: internetMessageId,
        calls: cost.calls,
        input_tokens: cost.input_tokens,
        output_tokens: cost.output_tokens,
        cost_eur: Number(cost.cost_eur.toFixed(6)),
        models: Object.keys(cost.model_breakdown),
      });
    }

    if (result.outcome === "irrelevant") {
      await markIrrelevant(supabase, internetMessageId, result.grund);
      return { outcome: "irrelevant" };
    }

    const ingestResult = result.ingestResult;
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
      openai_input_tokens: cost.input_tokens || undefined,
      openai_output_tokens: cost.output_tokens || undefined,
      openai_cost_eur: cost.cost_eur || undefined,
      // Diagnose-Felder: Skip-Reason und Anhang-Statistik landen in error_msg
      // damit pro Mail nachvollziehbar ist warum keine Bestellung entstand.
      skip_reason: ingestResult.skipped ? ingestResult.reason : undefined,
      debug_anhaenge: ingestResult.debug_anhaenge,
    });

    return { outcome: "processed", bestellung_id: ingestResult.bestellung_id };
  } catch (err) {
    logError("email-sync/replay", "Replay-Pipeline-Fehler", err);
    const msg = err instanceof Error ? err.message : "unbekannter_fehler";
    await markFailed(supabase, internetMessageId, msg);
    return { outcome: "failed", fehler: msg };
  }
}
