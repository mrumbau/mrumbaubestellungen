/**
 * besteller-display — vereinheitlicht das Rendern von besteller_kuerzel/name.
 *
 * 15.05.2026 (User-Feedback): Subunternehmer- und Abo-Bestellungen haben in der
 * DB `besteller_kuerzel='UNBEKANNT'` als Default — sie sind shared zwischen
 * allen Bestellern (jeder darf freigeben/verwerfen). Das wörtliche
 * "UNBEKANNT"-Label suggeriert aber fehlerhafte Daten und verwirrt User.
 *
 * Lösung: für SU/Abo-Bestellungen mit UNBEKANNT-Kürzel das Label durch "Geteilt"
 * ersetzen — semantisch "kein Einzelner zugeordnet, alle Besteller dürfen ran".
 *
 * Material-Bestellungen mit UNBEKANNT (Pipeline konnte keinen Besteller
 * identifizieren) bekommen weiterhin "UNBEKANNT" — die brauchen Admin-Aktion
 * und werden im Dashboard-Widget "Nicht zugeordnet" angezeigt.
 */

export type Bestellungsart = "material" | "subunternehmer" | "abo" | string | null | undefined;

export interface BestellerDisplay {
  /** Kürzel für Avatar/Badge — z.B. "MT", "CR", "GT" (für Geteilt). */
  kuerzel: string;
  /** Voller Anzeige-Name — z.B. "Marlon Tschon", "Geteilt (SU/Abo)". */
  name: string;
  /** True wenn das ein "Shared"-Display für SU/Abo ist (nicht echter User). */
  isShared: boolean;
}

const SHARED_BESTELLUNGSARTEN = new Set(["subunternehmer", "abo"]);

export function bestellerDisplay(
  besteller_kuerzel: string | null | undefined,
  besteller_name: string | null | undefined,
  bestellungsart?: Bestellungsart,
): BestellerDisplay {
  const isUnbekannt =
    !besteller_kuerzel ||
    besteller_kuerzel === "UNBEKANNT" ||
    besteller_kuerzel === "";

  if (isUnbekannt && bestellungsart && SHARED_BESTELLUNGSARTEN.has(bestellungsart)) {
    return {
      kuerzel: "GT",
      name: "Geteilt",
      isShared: true,
    };
  }

  return {
    kuerzel: besteller_kuerzel || "?",
    name: besteller_name || besteller_kuerzel || "?",
    isShared: false,
  };
}
