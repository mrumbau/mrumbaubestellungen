/**
 * E-Mail-Sync-Orchestrator.
 *
 * Wird vom Cron-Endpoint /api/cron/check-emails alle 2 min aufgerufen.
 * Iteriert alle aktiven Folder, holt Delta-Updates via Microsoft Graph,
 * verarbeitet neue Mails durch die existierende Webhook-Pipeline.
 *
 * Schutzmechanismen:
 * - Idempotenz: PK auf email_processing_log.internet_message_id
 * - Vercel-Timeout-Schutz: harte Grenze 50s, partial-commit erlaubt
 * - Bootstrap-Skip: erste Sync eines Folders schreibt vorhandene Mails
 *   als status='irrelevant' OHNE Pipeline-Aufruf
 * - Delta-Token-Expiry: 410 Gone → token=null, Bootstrap beim nächsten Tick
 */

import { createServiceClient } from "../supabase";
import { logError, logInfo } from "../logger";
import { deltaSync, DeltaTokenExpiredError, type MailMessage } from "../microsoft-graph/delta";
import { fetchAllFileAttachments } from "../microsoft-graph/attachments";
import { classifyEmail } from "../email-pipeline/classify";
import { ingestEmail } from "../email-pipeline/ingest";
import {
  claimMessage,
  markBootstrapSkip,
  markIrrelevant,
  markProcessed,
  markFailed,
} from "./idempotency";

interface FolderRow {
  id: string;
  graph_folder_id: string;
  folder_name: string;
  folder_path: string;
  document_hint: string | null;
  delta_token: string | null;
  enabled: boolean;
}

interface SyncResult {
  folder_id: string;
  folder_name: string;
  bootstrap: boolean;
  messages_seen: number;
  messages_processed: number;
  messages_skipped: number;
  messages_failed: number;
  duration_ms: number;
  error: string | null;
}

/** Vercel-Lambda Hard-Limit: 60s. Wir lassen 10s Puffer für Cleanup/Response. */
const MAX_RUN_MS = 50_000;
/** Pro Tick max so viele Mails über alle Folder. Schützt vor Bootstrap-Floods. */
const MAX_MESSAGES_PER_TICK = 30;

export interface OrchestratorResult {
  total_folders: number;
  total_messages_processed: number;
  total_messages_skipped: number;
  total_messages_failed: number;
  total_duration_ms: number;
  folders: SyncResult[];
  truncated: boolean;
}

export async function runOrchestrator(): Promise<OrchestratorResult> {
  const startTime = Date.now();
  const supabase = createServiceClient();

  const { data: folders, error: foldersErr } = await supabase
    .from("mail_sync_folders")
    .select("id, graph_folder_id, folder_name, folder_path, document_hint, delta_token, enabled")
    .eq("enabled", true)
    .order("last_sync_at", { ascending: true, nullsFirst: true });

  if (foldersErr) {
    throw new Error(`Folder-Abfrage fehlgeschlagen: ${foldersErr.message}`);
  }

  if (!folders || folders.length === 0) {
    return {
      total_folders: 0,
      total_messages_processed: 0,
      total_messages_skipped: 0,
      total_messages_failed: 0,
      total_duration_ms: Date.now() - startTime,
      folders: [],
      truncated: false,
    };
  }

  const results: SyncResult[] = [];
  let totalMessagesProcessed = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let truncated = false;

  for (const folder of folders as FolderRow[]) {
    if (Date.now() - startTime > MAX_RUN_MS) {
      truncated = true;
      break;
    }
    if (totalMessagesProcessed + totalSkipped >= MAX_MESSAGES_PER_TICK) {
      truncated = true;
      break;
    }

    const result = await syncFolder(supabase, folder, startTime, MAX_MESSAGES_PER_TICK - (totalMessagesProcessed + totalSkipped));
    results.push(result);
    totalMessagesProcessed += result.messages_processed;
    totalSkipped += result.messages_skipped;
    totalFailed += result.messages_failed;
  }

  return {
    total_folders: results.length,
    total_messages_processed: totalMessagesProcessed,
    total_messages_skipped: totalSkipped,
    total_messages_failed: totalFailed,
    total_duration_ms: Date.now() - startTime,
    folders: results,
    truncated,
  };
}

/* ─────────────────────────────────────────────────────────────────────── */

async function syncFolder(
  supabase: ReturnType<typeof createServiceClient>,
  folder: FolderRow,
  globalStartTime: number,
  remainingBudget: number,
): Promise<SyncResult> {
  const folderStart = Date.now();
  const isBootstrap = folder.delta_token === null;
  let messagesSeen = 0;
  let messagesProcessed = 0;
  let messagesSkipped = 0;
  let messagesFailed = 0;
  let lastError: string | null = null;
  let finalDeltaToken: string | null = null;

  try {
    const generator = deltaSync({
      folderId: folder.graph_folder_id,
      deltaToken: folder.delta_token,
    });

    while (true) {
      // Zeitbudget prüfen
      if (Date.now() - globalStartTime > MAX_RUN_MS) break;
      if (messagesSeen >= remainingBudget) break;

      const batch = await generator.next();
      if (batch.done) {
        finalDeltaToken = batch.value;
        break;
      }

      const messages = batch.value;
      for (const msg of messages) {
        if (Date.now() - globalStartTime > MAX_RUN_MS) break;
        if (messagesSeen >= remainingBudget) break;
        messagesSeen++;

        try {
          const outcome = await processMessage(supabase, folder, msg, isBootstrap);
          if (outcome === "processed") messagesProcessed++;
          else if (outcome === "skipped") messagesSkipped++;
          else if (outcome === "failed") messagesFailed++;
        } catch (err) {
          messagesFailed++;
          logError("email-sync/orchestrator", `Mail-Verarbeitung fehlgeschlagen für ${msg.internetMessageId}`, err);
        }
      }
    }

    // Folder-Status nur committen wenn wir vollständig durchgelaufen sind
    if (finalDeltaToken) {
      const { error: updateErr } = await supabase
        .from("mail_sync_folders")
        .update({
          delta_token: finalDeltaToken,
          last_sync_at: new Date().toISOString(),
          last_sync_count: messagesSeen,
          last_error: null,
        })
        .eq("id", folder.id);
      if (updateErr) {
        lastError = `Folder-Update fehlgeschlagen: ${updateErr.message}`;
      }
    } else {
      // Partial sync (Timeout / Budget) — Token NICHT committen, beim nächsten Tick weiter
      const { error: updateErr } = await supabase
        .from("mail_sync_folders")
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_count: messagesSeen,
        })
        .eq("id", folder.id);
      if (updateErr) {
        lastError = `Folder-Partial-Update fehlgeschlagen: ${updateErr.message}`;
      }
    }
  } catch (err) {
    if (err instanceof DeltaTokenExpiredError) {
      // Reset → Bootstrap beim nächsten Tick
      await supabase
        .from("mail_sync_folders")
        .update({
          delta_token: null,
          last_error: "delta_token_expired",
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", folder.id);
      lastError = "delta_token_expired";
    } else {
      lastError = err instanceof Error ? err.message : "unbekannter_fehler";
      logError("email-sync/orchestrator", `Folder-Sync fehlgeschlagen: ${folder.folder_name}`, err);
      await supabase
        .from("mail_sync_folders")
        .update({
          last_error: lastError.slice(0, 2000),
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", folder.id);
    }
  }

  const duration = Date.now() - folderStart;
  if (messagesSeen > 0) {
    logInfo("email-sync/orchestrator", `Folder ${folder.folder_name} synced`, {
      bootstrap: isBootstrap,
      seen: messagesSeen,
      processed: messagesProcessed,
      skipped: messagesSkipped,
      failed: messagesFailed,
      duration_ms: duration,
    });
  }

  return {
    folder_id: folder.id,
    folder_name: folder.folder_name,
    bootstrap: isBootstrap,
    messages_seen: messagesSeen,
    messages_processed: messagesProcessed,
    messages_skipped: messagesSkipped,
    messages_failed: messagesFailed,
    duration_ms: duration,
    error: lastError,
  };
}

/* ─────────────────────────────────────────────────────────────────────── */

async function processMessage(
  supabase: ReturnType<typeof createServiceClient>,
  folder: FolderRow,
  msg: MailMessage,
  isBootstrap: boolean,
): Promise<"processed" | "skipped" | "irrelevant" | "failed"> {
  // Tombstones (gelöschte Mails) ignorieren
  if (msg.removed) return "skipped";
  if (!msg.internetMessageId) return "skipped";

  // 1. Idempotenz-Claim
  const claimed = await claimMessage(supabase, {
    internet_message_id: msg.internetMessageId,
    graph_message_id: msg.id,
    folder_id: folder.id,
    folder_hint: folder.document_hint,
    received_at: msg.receivedDateTime,
    sender: msg.from?.emailAddress.address ?? null,
    subject: msg.subject ?? null,
    has_attachments: msg.hasAttachments,
  });

  if (!claimed) return "skipped";

  // 2. Bootstrap → ohne Pipeline-Aufruf als skipped markieren
  if (isBootstrap) {
    await markBootstrapSkip(supabase, msg.internetMessageId);
    return "skipped";
  }

  try {
    // 3. Vorprüfung via classifyEmail
    const classifyResult = await classifyEmail({
      email_absender: msg.from?.emailAddress.address ?? "",
      email_betreff: msg.subject ?? "",
      email_vorschau: msg.bodyPreview ?? "",
      hat_anhaenge: msg.hasAttachments,
    });

    if (!classifyResult.relevant) {
      await markIrrelevant(supabase, msg.internetMessageId, classifyResult.grund);
      return "irrelevant";
    }

    // 4. Anhänge laden (falls vorhanden)
    const attachments = msg.hasAttachments
      ? await fetchAllFileAttachments(msg.id)
      : [];

    // 5. Pipeline-Aufruf via /api/webhook/email
    const ingestResult = await ingestEmail({
      email_absender: msg.from?.emailAddress.address ?? "",
      email_betreff: msg.subject ?? "",
      email_datum: msg.receivedDateTime,
      email_text: msg.body?.content ?? "",
      email_vorschau: msg.bodyPreview ?? "",
      vorfilter: "ja",
      haendler_id: classifyResult.haendler_id,
      haendler_name: classifyResult.haendler_name,
      su_id: classifyResult.su_id,
      bestellnummer_betreff: classifyResult.bestellnummer_betreff,
      anhaenge: attachments,
      document_hint: folder.document_hint,
    });

    if (!ingestResult.success) {
      await markFailed(supabase, msg.internetMessageId, ingestResult.fehler ?? "ingest_fehlgeschlagen");
      return "failed";
    }

    await markProcessed(supabase, msg.internetMessageId, {
      bestellung_id: ingestResult.bestellung_id,
      ki_classified_as: ingestResult.dokument_typ,
      ki_confidence: ingestResult.ki_confidence,
      parser_source: ingestResult.parser_source,
      parser_name: ingestResult.parser_name,
    });
    return "processed";
  } catch (err) {
    const msgText = err instanceof Error ? err.message : "unbekannter_fehler";
    await markFailed(supabase, msg.internetMessageId, msgText);
    return "failed";
  }
}
