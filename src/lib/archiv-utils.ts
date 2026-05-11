/**
 * Pure-Helpers für die Archiv-Tab-Logik.
 * Aus archiv-client.tsx extrahiert (Block 4 Decomposition, 11.05.2026).
 *
 * Testbar via src/lib/__tests__/archiv-utils.test.ts.
 */

import type { ArchivedProjekt, MonthGroup, PaidBestellung } from "@/components/archiv/types";

/**
 * Gruppiert Bestellungen nach Monat des angegebenen Datumsfelds.
 * Sortiert die Gruppen absteigend (neuester Monat zuerst).
 * Items innerhalb einer Gruppe behalten die Eingabe-Reihenfolge.
 */
export function groupByMonth(
  items: PaidBestellung[],
  dateField: keyof PaidBestellung,
): MonthGroup[] {
  const groups = new Map<string, { items: PaidBestellung[]; subtotal: number }>();

  for (const item of items) {
    const dateVal = item[dateField];
    if (!dateVal || typeof dateVal !== "string") continue;
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(key)) {
      groups.set(key, { items: [], subtotal: 0 });
    }
    const g = groups.get(key)!;
    g.items.push(item);
    g.subtotal += Number(item.betrag) || 0;
  }

  return Array.from(groups.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, { items: monthItems, subtotal }]) => {
      const [year, month] = key.split("-");
      const d = new Date(Number(year), Number(month) - 1);
      const label = d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
      return {
        key,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        items: monthItems,
        subtotal,
      };
    });
}

/**
 * Volltext-Suche über Bestellung-Felder. Case-insensitive.
 * Matched: Bestellnummer, Händler, Besteller, Projekt, Subunternehmer-Firma/Gewerk.
 */
export function matchesSearchOrder(item: PaidBestellung, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    (item.bestellnummer || "").toLowerCase().includes(q) ||
    (item.haendler_name || "").toLowerCase().includes(q) ||
    (item.besteller_name || "").toLowerCase().includes(q) ||
    (item.projekt_name || "").toLowerCase().includes(q) ||
    (item.subunternehmer_firma || "").toLowerCase().includes(q) ||
    (item.subunternehmer_gewerk || "").toLowerCase().includes(q)
  );
}

/**
 * Volltext-Suche über Projekt-Felder. Case-insensitive.
 * Matched: Name, Beschreibung.
 */
export function matchesSearchProjekt(item: ArchivedProjekt, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    item.name.toLowerCase().includes(q) ||
    (item.beschreibung || "").toLowerCase().includes(q)
  );
}

/**
 * Prüft ob ein ISO-Datumsstring im Bereich [from, to] liegt.
 * Beide Grenzen sind inklusive. Leere Grenze = unbegrenzt in diese Richtung.
 * Vergleich auf YYYY-MM-DD-Präfix (ignoriert Uhrzeit).
 *
 * Wichtig: Bei null-Datum wird false zurückgegeben — der Filter scheidet
 * datumslose Einträge bewusst aus, sobald irgendeine Grenze gesetzt ist.
 */
export function inDateRange(dateStr: string | null, from: string, to: string): boolean {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}
