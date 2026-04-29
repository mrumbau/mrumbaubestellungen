/**
 * Pure Discovery — der erste Schritt der Fan-out-Architektur.
 *
 * Liest neue Mails per Microsoft-Graph-Delta und schreibt sie als
 * status='pending' in `email_processing_log`. KEIN Pipeline-Call hier —
 * die schwere KI-/Graph-Verarbeitung pro Mail läuft später isoliert in
 * `/api/cron/process-one` (eigenes Vercel-Lambda mit eigenen 60s).
 *
 * Vorteile:
 * - Discover läuft schnell (5–15 s typisch) → leicht im Vercel-Hobby-Budget
 * - Per-Mail-Verarbeitung ist isoliert → keine Cross-Contamination
 * - Bursts werden parallel verarbeitet (pg_cron + pg_net fanen out)
 * - Failure einer Mail beeinflusst andere nicht
 *
 * Bootstrap (delta_token=null beim ersten Sync eines Folders):
 * Mails werden direkt als 'irrelevant' mit error_msg='bootstrap_skip'
 * markiert — sie laufen NICHT durch die Pipeline.
 */

import { createServiceClient } from "@/lib/supabase";
import { logError, logInfo } from "@/lib/logger";
import { deltaSync, DeltaTokenExpiredError } from "@/lib/microsoft-graph/delta";
import { claimMessage, markBootstrapSkip } from "./idempotency";

interface FolderRow {
  id: string;
  graph_folder_id: string;
  folder_name: string;
  folder_path: string;
  document_hint: string | null;
  delta_token: string | null;
  enabled: boolean;
}

interface FolderDiscoverResult {
  folder_id: string;
  folder_name: string;
  bootstrap: boolean;
  messages_seen: number;
  messages_claimed: number;
  messages_bootstrap_skipped: number;
  duration_ms: number;
  error: string | null;
}

export interface DiscoverResult {
  total_folders: number;
  total_messages_claimed: number;
  total_bootstrap_skipped: number;
  total_duration_ms: number;
  folders: FolderDiscoverResult[];
  truncated: boolean;
}

/** Hartes Limit damit Discover-Phase im Vercel-Budget bleibt. */
const MAX_RUN_MS = 50_000;
/** Pro Discover-Tick max so viele Mails über alle Folder. */
const MAX_MESSAGES_PER_TICK = 100;

export async function runDiscover(): Promise<DiscoverResult> {
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

  const result: DiscoverResult = {
    total_folders: 0,
    total_messages_claimed: 0,
    total_bootstrap_skipped: 0,
    total_duration_ms: 0,
    folders: [],
    truncated: false,
  };

  if (!folders || folders.length === 0) {
    result.total_duration_ms = Date.now() - startTime;
    return result;
  }

  let totalSeen = 0;

  for (const folder of folders as FolderRow[]) {
    if (Date.now() - startTime > MAX_RUN_MS) {
      result.truncated = true;
      break;
    }
    if (totalSeen >= MAX_MESSAGES_PER_TICK) {
      result.truncated = true;
      break;
    }

    const remaining = MAX_MESSAGES_PER_TICK - totalSeen;
    const folderResult = await discoverFolder(
      supabase,
      folder,
      startTime,
      remaining,
    );
    result.folders.push(folderResult);
    result.total_messages_claimed += folderResult.messages_claimed;
    result.total_bootstrap_skipped += folderResult.messages_bootstrap_skipped;
    totalSeen += folderResult.messages_seen;
  }

  result.total_folders = result.folders.length;
  result.total_duration_ms = Date.now() - startTime;
  return result;
}

/* ─────────────────────────────────────────────────────────────────────── */

async function discoverFolder(
  supabase: ReturnType<typeof createServiceClient>,
  folder: FolderRow,
  globalStartTime: number,
  remainingBudget: number,
): Promise<FolderDiscoverResult> {
  const folderStart = Date.now();
  const isBootstrap = folder.delta_token === null;
  let messagesSeen = 0;
  let messagesClaimed = 0;
  let messagesBootstrapSkipped = 0;
  let lastError: string | null = null;
  let finalDeltaToken: string | null = null;

  try {
    const generator = deltaSync({
      folderId: folder.graph_folder_id,
      deltaToken: folder.delta_token,
    });

    while (true) {
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
        if (msg.removed || !msg.internetMessageId) continue;
        messagesSeen++;

        try {
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

          if (!claimed) continue; // bereits gesehen

          if (isBootstrap) {
            await markBootstrapSkip(supabase, msg.internetMessageId);
            messagesBootstrapSkipped++;
          } else {
            // Bleibt als status='pending' liegen — process-one holt's später
            messagesClaimed++;
          }
        } catch (err) {
          logError(
            "email-sync/discover",
            `Claim/Bootstrap-Fehler bei ${msg.internetMessageId}`,
            err,
          );
        }
      }
    }

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
      // Partial Sync (Timeout / Budget) — Token NICHT committen
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
      logError("email-sync/discover", `Folder-Sync fehlgeschlagen: ${folder.folder_name}`, err);
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
    logInfo("email-sync/discover", `Folder ${folder.folder_name} discovered`, {
      bootstrap: isBootstrap,
      seen: messagesSeen,
      claimed: messagesClaimed,
      bootstrap_skipped: messagesBootstrapSkipped,
      duration_ms: duration,
    });
  }

  return {
    folder_id: folder.id,
    folder_name: folder.folder_name,
    bootstrap: isBootstrap,
    messages_seen: messagesSeen,
    messages_claimed: messagesClaimed,
    messages_bootstrap_skipped: messagesBootstrapSkipped,
    duration_ms: duration,
    error: lastError,
  };
}
