/**
 * Mahnung-Display-Helpers — defensive Regeln für die UI (03.06.2026,
 * verschärft 09.06.2026).
 *
 * Single-Source-of-Truth: keine Komponente darf direkt `b.mahnung_am`
 * checken und ein Banner zeigen. Stattdessen `shouldShowMahnung(b)` und
 * `mahnungStufeLabel(b)` nutzen — die wenden alle Defensive-Checks an:
 *
 *   • mahnung_am muss gesetzt sein (kein Counter ohne Datum)
 *   • mahnung_count muss > 0 sein (kein "0. Stufe")
 *   • Sanity-Cap bei 10 (alles darüber ist Datenmüll, z.B. doppelter
 *     RPC-Trigger bei der gleichen Mail-Verarbeitung)
 *   • Bestellung darf NICHT bezahlt sein:
 *       - bezahlt_am gesetzt (manuell durch NJ) ODER
 *       - bezahlt_bereits=true (KI hat PayPal/Vorkasse erkannt)
 *   • Status freigegeben/verworfen/storniert → keine Mahnung mehr zeigen
 *   • hat_rechnung MUSS true sein — eine Mahnung ohne Rechnung ist
 *     fachlich nicht plausibel. Wenn die Pipeline eine Mahn-Mail erkennt
 *     bevor die Rechnung selbst angekommen ist, ist das Datenmüll oder
 *     ein Review-Fall. Wir zeigen die Stufe in dem Fall NICHT.
 *
 * Wer trotzdem prüfen will, ob eine Mahn-Mail eingegangen ist (z.B. um
 * einen Review-Hinweis statt einer Stufe anzuzeigen), nutzt
 * `mahnungReviewHinweis(b)`.
 */

export interface MahnungDisplayInput {
  mahnung_am?: string | null;
  mahnung_count?: number | null;
  bezahlt_am?: string | null;
  bezahlt_bereits?: boolean | null;
  status?: string | null;
  /**
   * 09.06.2026 — Hard-Required für Anzeige.
   * Mahn-Mail ohne hinterlegte Rechnung → kein Banner, höchstens Review-
   * Hinweis (siehe `mahnungReviewHinweis`).
   */
  hat_rechnung?: boolean | null;
}

const TERMINAL_STATI = new Set(["freigegeben", "verworfen", "storniert"]);
const MAHNUNG_CAP = 10;

export function shouldShowMahnung(b: MahnungDisplayInput): boolean {
  if (!b.mahnung_am) return false;
  const count = b.mahnung_count ?? 0;
  if (count <= 0 || count > MAHNUNG_CAP) return false;
  if (b.bezahlt_am) return false;
  if (b.bezahlt_bereits === true) return false;
  // 09.06.2026 — Ohne Rechnung keine Mahnstufe.
  // hat_rechnung undefined wird als false behandelt: Caller müssen den Wert
  // bewusst aus der Bestellung laden + ggf. aus Dokumenten aggregieren.
  if (b.hat_rechnung !== true) return false;
  if (b.status && TERMINAL_STATI.has(b.status)) return false;
  return true;
}

/**
 * Liefert ein Display-Label für die Mahnung-Stufe ("Mahnung", "2. Mahnung", ...)
 * oder null wenn keine Mahnung angezeigt werden soll.
 */
export function mahnungStufeLabel(b: MahnungDisplayInput): string | null {
  if (!shouldShowMahnung(b)) return null;
  const count = b.mahnung_count ?? 1;
  return count > 1 ? `${count}. Mahnung` : "Mahnung";
}

/**
 * Liefert die effektive Mahnungsanzahl für die UI (clipped auf 1..10), oder
 * 0 wenn keine angezeigt werden soll.
 */
export function effectiveMahnungCount(b: MahnungDisplayInput): number {
  if (!shouldShowMahnung(b)) return 0;
  return Math.min(MAHNUNG_CAP, Math.max(1, b.mahnung_count ?? 1));
}

/**
 * 09.06.2026 — Wenn eine Mahn-Mail erkannt wurde aber keine Rechnung
 * vorliegt: kein Mahnungs-Banner, sondern Review-Hinweis. Liefert null
 * wenn kein Review-Hinweis nötig ist (also: entweder kein Mahnungs-Hinweis
 * vorhanden, oder Rechnung schon da → echte Mahnung wird via
 * `shouldShowMahnung` gerendert).
 */
export function mahnungReviewHinweis(b: MahnungDisplayInput): string | null {
  if (!b.mahnung_am) return null;
  // Schon bezahlt? Dann kein Review-Hinweis, sondern still.
  if (b.bezahlt_am) return null;
  if (b.bezahlt_bereits === true) return null;
  if (b.status && TERMINAL_STATI.has(b.status)) return null;
  // Echte Mahnung wird angezeigt — kein Review-Hinweis nötig
  if (b.hat_rechnung === true) return null;
  // Mahn-Mail vorhanden, aber keine Rechnung → Review-Hinweis
  return "Mahn-Mail erkannt, aber keine Rechnung hinterlegt";
}
