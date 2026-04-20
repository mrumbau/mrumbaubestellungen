import { createServerSupabaseClient } from "@/lib/supabase-server";
import { LogsClient, type WebhookLog } from "./logs-client";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  // Role-gate handled in parent /einstellungen/system/layout.tsx
  const supabase = await createServerSupabaseClient();
  const { data: logs } = await supabase
    .from("webhook_logs")
    .select("id, typ, status, bestellnummer, fehler_text, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return <LogsClient initialLogs={(logs as WebhookLog[]) || []} />;
}
