// Zentralisierte Formatierungs-Utilities

export function formatDatum(iso: string | null): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatBetrag(betrag: number | null, waehrung?: string): string {
  if (betrag == null) return "–";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: waehrung || "EUR",
  }).format(betrag);
}
