/**
 * Shared-Constants für die Email-Pipeline.
 *
 * 19.05.2026 (A2.1) — aus run.ts extrahiert. Wird von run.ts und mehreren
 * Pipeline-Submodulen (bestellung-propagate, fallback-keyword) gebraucht.
 */

/** Doku-Typen die eine "echte" Bestellung darstellen (für Rollback-Logik). */
export const PRIMAER_TYPEN: string[] = [
  "bestellbestaetigung",
  "rechnung",
  "aufmass",
  "leistungsnachweis",
];

/** Alle akzeptierten Doku-Typen (Filter gegen typ='anlage'/'unbekannt'). */
export const BEKANNTE_TYPEN: string[] = [
  "bestellbestaetigung",
  "lieferschein",
  "rechnung",
  "aufmass",
  "leistungsnachweis",
  "versandbestaetigung",
];

/** Doku-Typ → bestellungen.hat_*-Spalte. Wird in propagate + duplikat-check genutzt. */
export const FLAG_MAP: Record<string, string> = {
  bestellbestaetigung: "hat_bestellbestaetigung",
  lieferschein: "hat_lieferschein",
  rechnung: "hat_rechnung",
  aufmass: "hat_aufmass",
  leistungsnachweis: "hat_leistungsnachweis",
  versandbestaetigung: "hat_versandbestaetigung",
};
