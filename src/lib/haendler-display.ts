/**
 * haendler-display — saubere Anzeige von haendler_name.
 *
 * 02.06.2026 (UX-Polish): die Pipeline (bestellung-finden.ts) markiert
 * Händler, deren `haendler_name` wie eine reine Domain aussieht
 * (z.B. `make.com`, `linear.app`, `vercel.com`), mit dem Prefix
 * "Unbekannter Lieferant (…)". Das ist als Defensive-Anti-Pollution gegen
 * Domain-only-Pseudo-Händler gedacht. Aber: moderne SaaS-Brands (Make.com,
 * Linear, Vercel, Notion, …) HEIßEN tatsächlich so — der Prefix wirkt dann
 * widersprüchlich („Make.com ist unbekannt? doch nicht").
 *
 * Lösung: Display-Layer-Helper, der den Prefix abstreift und nur den Marker
 * `isUnsicher=true` zurückgibt. UI rendert dann den Domain-Namen sauber + ein
 * subtles „?"-Icon mit Tooltip „Pipeline hat den Namen nicht eindeutig erkannt".
 *
 * Original-Pipeline-Logik bleibt unangetastet — sie hilft weiterhin gegen
 * `rolladenplanet.info` & Co. Wir interpretieren nur sauberer in der UI.
 */

const UNBEKANNT_PREFIX_RE = /^Unbekannter Lieferant \((.+)\)$/;

export interface HaendlerDisplay {
  name: string;
  /** True wenn die Pipeline einen Domain-only-Namen markiert hat. */
  isUnsicher: boolean;
}

export function haendlerDisplay(
  haendler_name: string | null | undefined,
): HaendlerDisplay {
  if (!haendler_name) return { name: "–", isUnsicher: false };
  const trimmed = haendler_name.trim();
  if (!trimmed) return { name: "–", isUnsicher: false };
  const match = trimmed.match(UNBEKANNT_PREFIX_RE);
  if (match) return { name: match[1], isUnsicher: true };
  return { name: trimmed, isUnsicher: false };
}
