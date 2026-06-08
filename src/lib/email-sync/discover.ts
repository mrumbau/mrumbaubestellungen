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
  /**
   * 08.06.2026 — neue Semantik: Anzahl Mails die wir tatsächlich NEU geclaimet
   * haben (= Pipeline-Arbeit erzeugen). Bereits-bekannte Mails laufen nicht
   * hierdurch — die zählen in `messages_already_known`. Das ist der Fix für
   * den Burst-Bug: Budget wird gegen messages_claimed gemessen, nicht gegen
   * "alles was wir gelesen haben".
   */
  messages_seen: number;
  messages_claimed: number;
  messages_bootstrap_skipped: number;
  /**
   * 08.06.2026 — Diagnose: wie viele Mails wurden von Graph zurückgegeben,
   * waren aber bereits geclaimet (status='pending'|'processed'|'failed'|
   * 'irrelevant'). Wenn dieser Wert dauerhaft hoch ist + messages_claimed
   * niedrig, sind wir in einem "Partial-Replay-Loop" (= Token nicht
   * fortgeschrieben). Sollte bei normalem Sync ≈0 sein.
   */
  messages_already_known: number;
  pages_read: number;
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
/** Pro Discover-Tick max so viele NEU GECLAIMTE Mails über alle Folder. */
const MAX_MESSAGES_PER_TICK = 100;
/**
 * 08.06.2026 — Hartes Page-Limit pro Folder pro Tick. Wallclock-Schutz für
 * den Fall dass viele bereits-bekannte Mails aus dem Delta-Stream kommen
 * (= claim ist no-op, aber Page-Pull braucht trotzdem ~200ms Graph-Roundtrip).
 * Bei $top=50 entspricht das max 20×50=1000 Lookups pro Folder pro Tick.
 */
const MAX_PAGES_PER_FOLDER = 20;

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
  // 08.06.2026 (Burst-Bug-Fix) — getrennte Counter:
  //   messagesNewlyClaimed = wirklich neu (Budget-Maß)
  //   messagesAlreadyKnown = von Graph zurückgegeben, claim no-op
  //   pagesRead = Wallclock-Schutz gegen ewige Schleife
  let messagesNewlyClaimed = 0;
  let messagesAlreadyKnown = 0;
  let messagesBootstrapSkipped = 0;
  let pagesRead = 0;
  let lastError: string | null = null;
  let finalDeltaToken: string | null = null;

  try {
    const generator = deltaSync({
      folderId: folder.graph_folder_id,
      deltaToken: folder.delta_token,
    });

    while (true) {
      if (Date.now() - globalStartTime > MAX_RUN_MS) break;
      // 08.06.2026 — Budget zählt jetzt NUR neu geclaimte (= Pipeline-Arbeit).
      // Bereits bekannte Mails blockieren das Budget nicht mehr, sodass der
      // Loop bei großen Bursts (>100 Mails seit letztem Delta) durch die
      // schon-pending-Mails durchläuft und die neuen am Ende auch erreicht.
      if (messagesNewlyClaimed >= remainingBudget) break;
      // 08.06.2026 — Page-Cap als Wallclock-Schutz: bei extrem langem
      // Delta-Stream (z.B. 5000 alte Mails durch Token-Replay) brechen wir
      // nach 20 Pages ab. Bei $top=50 = max 1000 lookups pro Folder/Tick.
      if (pagesRead >= MAX_PAGES_PER_FOLDER) break;

      const batch = await generator.next();
      if (batch.done) {
        finalDeltaToken = batch.value;
        break;
      }
      // Counter NACH done-Check, damit der Done-Marker selbst nicht als
      // gelesene Page zählt.
      pagesRead++;

      const messages = batch.value;
      for (const msg of messages) {
        if (Date.now() - globalStartTime > MAX_RUN_MS) break;
        if (messagesNewlyClaimed >= remainingBudget) break;
        if (msg.removed || !msg.internetMessageId) continue;

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

          if (!claimed) {
            // Bereits in email_processing_log → Counter nur für Diagnose
            messagesAlreadyKnown++;
            continue;
          }

          // 08.06.2026 — Counter NACH erfolgreichem claim. Das ist der Bug-Fix:
          // vor dem 08.06. wurde der Counter VOR claim erhöht und blockierte
          // das Budget mit bereits-bekannten Mails → Mails nach Position 100
          // im Delta-Stream wurden bei Bursts nie erreicht.
          messagesNewlyClaimed++;

          if (isBootstrap) {
            await markBootstrapSkip(supabase, msg.internetMessageId);
            messagesBootstrapSkipped++;
          }
          // Sonst: bleibt als status='pending' liegen — process-one holt's später
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
          last_sync_count: messagesNewlyClaimed,
          last_error: null,
        })
        .eq("id", folder.id);
      if (updateErr) {
        lastError = `Folder-Update fehlgeschlagen: ${updateErr.message}`;
      }
    } else {
      // Partial Sync (Timeout / Budget / Page-Cap) — Token NICHT committen.
      // 08.06.2026: last_sync_count zeigt jetzt die NEU geclaimte Anzahl
      // (vorher: alle gesehenen — verfälschte Statistik bei Replay-Schleife).
      const { error: updateErr } = await supabase
        .from("mail_sync_folders")
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_count: messagesNewlyClaimed,
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
  if (messagesNewlyClaimed > 0 || messagesAlreadyKnown > 0) {
    logInfo("email-sync/discover", `Folder ${folder.folder_name} discovered`, {
      bootstrap: isBootstrap,
      newly_claimed: messagesNewlyClaimed,
      already_known: messagesAlreadyKnown,
      bootstrap_skipped: messagesBootstrapSkipped,
      pages_read: pagesRead,
      finalized_delta: finalDeltaToken !== null,
      duration_ms: duration,
    });
  }

  return {
    folder_id: folder.id,
    folder_name: folder.folder_name,
    bootstrap: isBootstrap,
    // 08.06.2026 (Bug-Fix) — messages_seen ist jetzt die Anzahl NEU geclaimter
    // Mails (Pipeline-Arbeit), nicht mehr "alles was Graph zurückgegeben hat".
    // Aufrufer (runDiscover) nutzt diesen Wert für globales Tick-Budget.
    messages_seen: messagesNewlyClaimed,
    messages_claimed: messagesNewlyClaimed,
    messages_bootstrap_skipped: messagesBootstrapSkipped,
    messages_already_known: messagesAlreadyKnown,
    pages_read: pagesRead,
    duration_ms: duration,
    error: lastError,
  };
}
