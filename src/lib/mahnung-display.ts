/**
 * Mahnung-Display-Helpers — defensive Regeln für die UI (03.06.2026).
 *
 * Single-Source-of-Truth: keine Komponente darf direkt `b.mahnung_am`
 * checken und ein Banner zeigen. Stattdessen `shouldShowMahnung(b)` und
 * `mahnungLabelFor(b)` nutzen — die wenden alle Defensive-Checks an:
 *
 *   • mahnung_am muss gesetzt sein (kein Counter ohne Datum)
 *   • mahnung_count muss > 0 sein (kein "0. Stufe")
 *   • Bestellung darf NICHT bezahlt sein:
 *       - bezahlt_am gesetzt (manuell durch NJ) ODER
 *       - bezahlt_bereits=true (KI hat PayPal/Vorkasse erkannt)
 *   • Sanity-Cap bei 10 (alles darüber ist Datenmüll, z.B. doppelter
 *     RPC-Trigger bei der gleichen Mail-Verarbeitung)
 *   • Status freigegeben/verworfen/storniert → keine Mahnung mehr zeigen
 */

export interface MahnungDisplayInput {
  mahnung_am?: string | null;
  mahnung_count?: number | null;
  bezahlt_am?: string | null;
  bezahlt_bereits?: boolean | null;
  status?: string | null;
}

const TERMINAL_STATI = new Set(["freigegeben", "verworfen", "storniert"]);
const MAHNUNG_CAP = 10;

export function shouldShowMahnung(b: MahnungDisplayInput): boolean {
  if (!b.mahnung_am) return false;
  const count = b.mahnung_count ?? 0;
  if (count <= 0 || count > MAHNUNG_CAP) return false;
  if (b.bezahlt_am) return false;
  if (b.bezahlt_bereits === true) return false;
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
