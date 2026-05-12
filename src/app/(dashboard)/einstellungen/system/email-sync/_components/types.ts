/**
 * Geteilte Types + Konstanten für die E-Mail-Sync-Tabs.
 * Aus email-sync-client.tsx extrahiert (12.05.2026, F6.2 Decomposition).
 */

export type Tab = "folders" | "monitor" | "telemetry";

export interface Folder {
  id: string;
  graph_folder_id: string;
  folder_name: string;
  folder_path: string;
  document_hint: string | null;
  delta_token: string | null;
  enabled: boolean;
  last_sync_at: string | null;
  last_sync_count: number | null;
  last_error: string | null;
  created_at: string;
}

export interface GraphFolder {
  id: string;
  displayName: string;
  path: string;
  totalItemCount: number;
  unreadItemCount: number;
}

export interface LogEntry {
  internet_message_id: string;
  graph_message_id: string;
  folder_id: string;
  folder_hint: string | null;
  ki_classified_as: string | null;
  ki_confidence: number | null;
  folder_mismatch: boolean | null;
  status: "pending" | "irrelevant" | "processed" | "failed";
  received_at: string | null;
  processed_at: string | null;
  openai_input_tokens: number | null;
  openai_output_tokens: number | null;
  openai_cost_eur: number | null;
  error_msg: string | null;
  bestellung_id: string | null;
  sender: string | null;
  subject: string | null;
  has_attachments: boolean | null;
  created_at: string;
  parser_source: "vendor" | "ki" | null;
  parser_name: string | null;
  mail_sync_folders: { folder_name: string; folder_path: string };
}

export interface Telemetry {
  daily_spend: { date: string; eur: number }[];
  status_counts: Record<string, number>;
  mismatch_rate: number;
  total_cost_30d_eur: number;
  total_mails_30d: number;
  top_costly: {
    internet_message_id: string;
    sender: string | null;
    subject: string | null;
    cost_eur: number;
    created_at: string;
  }[];
  folder_health: {
    id: string;
    folder_name: string;
    folder_path: string;
    enabled: boolean;
    last_sync_at: string | null;
    last_sync_count: number | null;
    last_error: string | null;
    mails_24h: number;
  }[];
  parser: {
    vendor_count: number;
    ki_count: number;
    vendor_rate: number;
    avg_ki_cost_eur: number;
    estimated_savings_eur: number;
    by_vendor: Record<string, number>;
  };
}

export const HINT_LABELS: Record<string, string> = {
  rechnung: "Rechnung",
  lieferschein: "Lieferschein",
  bestellbestaetigung: "Bestellbestätigung",
  versand: "Versand/Zustellung",
};

export type ToastFn = (
  title: React.ReactNode,
  opts?: {
    description?: React.ReactNode;
    duration?: number;
    action?: { label: string; onClick: () => void };
  },
) => string;
