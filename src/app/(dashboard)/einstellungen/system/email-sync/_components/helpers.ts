/**
 * Pure-Helpers für die E-Mail-Sync-Tabs.
 * Aus email-sync-client.tsx extrahiert (12.05.2026, F6.2 Decomposition).
 */

export function relativeTime(iso: string | null): string {
  if (!iso) return "nie";
  const diffMs = Date.now() - new Date(iso).getTime();
  const ms = Math.abs(diffMs);
  const prefix = diffMs >= 0 ? "vor" : "in";
  if (ms < 60_000) return diffMs >= 0 ? "gerade eben" : "in wenigen Sekunden";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${prefix} ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${prefix} ${h} h`;
  return `${prefix} ${Math.floor(h / 24)} Tagen`;
}

export function statusTone(
  status: string,
): "neutral" | "warning" | "success" | "error" {
  switch (status) {
    case "processed":
      return "success";
    case "failed":
      return "error";
    case "irrelevant":
      return "neutral";
    case "pending":
      return "warning";
    default:
      return "neutral";
  }
}
