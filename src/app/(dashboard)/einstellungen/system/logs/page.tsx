import { createServerSupabaseClient } from "@/lib/supabase-server";
import { LogsClient, type PipelineLog } from "./logs-client";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  // Role-gate handled in parent /einstellungen/system/layout.tsx
  // A4.14 (19.05.2026) — Unified-View v_pipeline_logs liefert webhook_logs +
  // email_processing_log mit normalisierten Spalten (quelle, record_id, typ,
  // status, bestellung_id, bestellnummer, sender, subject, detail, extras).
  const supabase = await createServerSupabaseClient();
  const { data: logs } = await supabase
    .from("v_pipeline_logs")
    .select("quelle, record_id, typ, status, bestellung_id, bestellnummer, sender, subject, detail, created_at, extras")
    .order("created_at", { ascending: false })
    .limit(100);

  return <LogsClient initialLogs={(logs as PipelineLog[]) || []} />;
}
