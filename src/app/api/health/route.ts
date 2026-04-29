import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// GET /api/health – Health-Check Endpoint
// Antwortet 200 bei OK, 503 bei kritischen Problemen (Supabase down).
// Email-Sync-Status: Warnungen werden geliefert aber führen NICHT zu 503,
// damit ein OpenAI-Hickser oder Folder-Sync-Problem nicht den Gesamt-Health
// kippt (sonst würden externe Monitoring-Tools fälschlich Alarm schlagen).
export async function GET() {
  let supabaseStatus = "unknown";

  // Supabase prüfen
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("benutzer_rollen").select("id").limit(1);
    supabaseStatus = error ? "error" : "ok";
  } catch {
    supabaseStatus = "error";
  }

  // Interne Checks: Nur prüfen ob konfiguriert (Werte werden NICHT exponiert)
  const openaiStatus = process.env.OPENAI_API_KEY ? "ok" : "missing";
  const makeWebhookStatus = process.env.MAKE_WEBHOOK_SECRET ? "configured" : "missing";
  const graphStatus =
    process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET
      ? "configured"
      : "missing";

  // E-Mail-Sync-Status: aggregiert aus mail_sync_folders + email_processing_log
  const emailSync = await checkEmailSyncHealth();

  const status = supabaseStatus === "ok" ? "ok" : "error";

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      supabase: supabaseStatus,
      openai: openaiStatus,
      make_webhook: makeWebhookStatus,
      microsoft_graph: graphStatus,
      email_sync: emailSync,
    },
    { status: status === "ok" ? 200 : 503 }
  );
}

interface EmailSyncHealth {
  status: "ok" | "warning" | "error" | "inactive";
  /** Anzahl konfigurierter, aktiver Folder */
  active_folders: number;
  /** Folder mit gesetztem last_error */
  folders_with_error: number;
  /** Folder die noch nie gesynct wurden (delta_token = null) */
  bootstrap_pending: number;
  /** Wann lief der Cron zuletzt erfolgreich (= zuletzt eine Mail verarbeitet)? */
  last_processed_at: string | null;
  /** Failed-Mails in den letzten 24h */
  failed_last_24h: number;
  /** Failed-Mails die das Retry-Limit erreicht haben */
  permanent_failures_24h: number;
  /** Mismatch-Rate letzte 7 Tage */
  mismatch_rate_7d: number;
  /** Mails aktuell in pending (= claimed aber noch nicht von process-one verarbeitet) */
  pending_in_queue: number;
  /** Pending-Mails älter als 10 min (sollten von cleanup-stale-pending behandelt werden) */
  stale_pending: number;
  warnings: string[];
}

async function checkEmailSyncHealth(): Promise<EmailSyncHealth> {
  const result: EmailSyncHealth = {
    status: "inactive",
    active_folders: 0,
    folders_with_error: 0,
    bootstrap_pending: 0,
    last_processed_at: null,
    failed_last_24h: 0,
    permanent_failures_24h: 0,
    mismatch_rate_7d: 0,
    pending_in_queue: 0,
    stale_pending: 0,
    warnings: [],
  };

  try {
    const sb = createServiceClient();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const staleSince = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const [foldersRes, lastProcessedRes, failed24hRes, mismatch7dRes, pendingRes, stalePendingRes] =
      await Promise.all([
        sb
          .from("mail_sync_folders")
          .select("id, enabled, last_error, delta_token"),
        sb
          .from("email_processing_log")
          .select("processed_at")
          .eq("status", "processed")
          .order("processed_at", { ascending: false })
          .limit(1),
        sb
          .from("email_processing_log")
          .select("retry_count")
          .eq("status", "failed")
          .gte("created_at", since24h),
        sb
          .from("email_processing_log")
          .select("folder_mismatch")
          .gte("created_at", since7d)
          .not("folder_mismatch", "is", null),
        sb
          .from("email_processing_log")
          .select("internet_message_id", { count: "exact", head: true })
          .eq("status", "pending"),
        sb
          .from("email_processing_log")
          .select("internet_message_id", { count: "exact", head: true })
          .eq("status", "pending")
          .lt("created_at", staleSince),
      ]);

    const folders = foldersRes.data ?? [];
    result.active_folders = folders.filter((f) => f.enabled).length;
    result.folders_with_error = folders.filter((f) => f.last_error).length;
    result.bootstrap_pending = folders.filter(
      (f) => f.enabled && f.delta_token === null,
    ).length;

    result.last_processed_at = lastProcessedRes.data?.[0]?.processed_at ?? null;

    const failed = failed24hRes.data ?? [];
    result.failed_last_24h = failed.length;
    result.permanent_failures_24h = failed.filter(
      (f) => (f.retry_count ?? 0) >= 3,
    ).length;

    const mismatchRows = mismatch7dRes.data ?? [];
    if (mismatchRows.length > 0) {
      const mismatches = mismatchRows.filter((r) => r.folder_mismatch === true).length;
      result.mismatch_rate_7d = Math.round((mismatches / mismatchRows.length) * 1000) / 1000;
    }

    result.pending_in_queue = pendingRes.count ?? 0;
    result.stale_pending = stalePendingRes.count ?? 0;

    // Status-Bewertung
    if (result.active_folders === 0) {
      result.status = "inactive";
      result.warnings.push("Keine aktiven Folder konfiguriert");
    } else if (result.folders_with_error > 0) {
      result.status = "error";
      result.warnings.push(`${result.folders_with_error} Folder mit Fehler`);
    } else if (result.permanent_failures_24h >= 5) {
      result.status = "error";
      result.warnings.push(
        `${result.permanent_failures_24h} permanent failed Mails (Retry-Limit erreicht)`,
      );
    } else if (result.failed_last_24h >= 10) {
      result.status = "warning";
      result.warnings.push(
        `${result.failed_last_24h} failed Mails in 24h (Auto-Retry läuft stündlich)`,
      );
    } else if (result.last_processed_at) {
      const ageMs = Date.now() - new Date(result.last_processed_at).getTime();
      if (ageMs > 6 * 60 * 60 * 1000) {
        result.status = "warning";
        result.warnings.push(
          "Seit >6h keine Mail verarbeitet — Cron läuft, aber kein Eingang?",
        );
      } else {
        result.status = "ok";
      }
    } else if (result.bootstrap_pending > 0) {
      result.status = "warning";
      result.warnings.push(`${result.bootstrap_pending} Folder warten auf Bootstrap`);
    } else {
      result.status = "ok";
    }

    if (result.mismatch_rate_7d > 0.25) {
      result.warnings.push(
        `Folder-Mismatch-Rate ${(result.mismatch_rate_7d * 100).toFixed(1)}% — Outlook-Sortierregel evtl. zu schwach`,
      );
    }

    if (result.stale_pending > 0) {
      // stale-cleanup-Cron sollte das alle 5 min aufräumen — wenn das hier
      // wächst, läuft cleanup-stale-pending nicht (oder gar nicht eingerichtet)
      result.warnings.push(
        `${result.stale_pending} Mails >10 min in pending — pg_cron cleanup-stale-pending läuft nicht?`,
      );
      if (result.status === "ok") result.status = "warning";
    }
    if (result.pending_in_queue > 50) {
      // Discover läuft schneller als process-one — Backlog wächst
      result.warnings.push(
        `${result.pending_in_queue} Mails in Queue — process-pending-emails Cron Backlog-Throughput zu klein?`,
      );
      if (result.status === "ok") result.status = "warning";
    }
  } catch (err) {
    result.status = "error";
    result.warnings.push(
      `Health-Check fehlgeschlagen: ${err instanceof Error ? err.message : "unbekannt"}`,
    );
  }

  return result;
}
