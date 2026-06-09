/**
 * Zuordnungs-Helpers für die UI (09.06.2026).
 *
 * Zentralisiert:
 *   - Marker-Konstanten (UNBEKANNT / Gemeinschaft)
 *   - Helper zum Bauen der Dropdown-Optionen pro Zuordnungs-Stelle
 *
 * Regeln (auf User-Wunsch):
 *   • Nur Bestellerinnen sind valide Zuordnungs-Ziele (Admin-Konten wie MH
 *     fallen raus). Neue Besteller-Accounts erscheinen automatisch, weil
 *     die Optionen aus benutzer_rollen kommen.
 *   • Eigener Kürzel (= aktiv eingeloggter User) wird ausgefiltert — kein
 *     Self-Claim auf sich selbst.
 *   • Aktueller Besitzer der Bestellung wird ausgefiltert — kein no-op-
 *     Update auf den schon gesetzten Wert.
 *   • Virtuelles Item "GT (Gemeinschaft)" wird angehängt — semantisch =
 *     zurück in Pool (besteller_kuerzel = UNBEKANNT). Nur sichtbar wenn
 *     der aktuelle Owner nicht eh schon UNBEKANNT ist.
 */

/** Pool-Marker in der DB. */
export const POOL_KUERZEL = "UNBEKANNT";

/** Anzeige-Label für die virtuelle GT-Option. */
export const GEMEINSCHAFT_LABEL = "Gemeinschaft";

export interface AssignableBestellerOption {
  /** Kürzel das ans Backend geht. Für die virtuelle GT-Option: "UNBEKANNT". */
  kuerzel: string;
  /** Anzeige-Name im Menü. Für GT: "Gemeinschaft". */
  name: string;
  /** Markiert das virtuelle Gemeinschaft-Item — UI rendert es separiert. */
  isGemeinschaft?: boolean;
}

interface BestellerInput {
  kuerzel: string;
  name: string;
  rolle?: string | null;
}

/**
 * Liefert die Zuordnungs-Optionen für ein Dropdown.
 *
 * @param alleBesteller Aus benutzer_rollen geladen (bestellerOptions)
 * @param currentOwner Kürzel des aktuellen Owners (z.B. "MT" oder "UNBEKANNT")
 * @param eigenerKuerzel Kürzel des eingeloggten Users
 */
export function getAssignableBesteller(
  alleBesteller: BestellerInput[],
  currentOwner: string | null,
  eigenerKuerzel: string,
): AssignableBestellerOption[] {
  const currentNormalized = (currentOwner ?? POOL_KUERZEL).toUpperCase();
  const selfNormalized = eigenerKuerzel.toUpperCase();

  const echteBesteller: AssignableBestellerOption[] = alleBesteller
    .filter((b) => {
      // Nur produktive Besteller — Admin/Buchhaltung raus.
      // Wenn rolle nicht geliefert wird (Legacy-Caller), defensive durchlassen.
      if (b.rolle && b.rolle !== "besteller") return false;
      // Aktueller Owner raus
      if (b.kuerzel.toUpperCase() === currentNormalized) return false;
      // Self raus
      if (b.kuerzel.toUpperCase() === selfNormalized) return false;
      return true;
    })
    .map((b) => ({ kuerzel: b.kuerzel, name: b.name }));

  // GT-Option nur anhängen wenn aktueller Owner nicht eh schon Pool ist.
  if (currentNormalized !== POOL_KUERZEL) {
    echteBesteller.push({
      kuerzel: POOL_KUERZEL,
      name: GEMEINSCHAFT_LABEL,
      isGemeinschaft: true,
    });
  }

  return echteBesteller;
}

/**
 * Confirm-Dialog-Text generieren, abhängig von Single/Bulk + Ziel.
 */
export function buildZuordnungConfirmText(
  zielKuerzel: string,
  zielName: string,
  count: number,
): string {
  const istGemeinschaft = zielKuerzel.toUpperCase() === POOL_KUERZEL;

  if (count === 1) {
    return istGemeinschaft
      ? "Diese Bestellung wirklich in Gemeinschaft zurückgeben?"
      : `Diese Bestellung wirklich ${zielKuerzel} (${zielName}) zuordnen?`;
  }
  return istGemeinschaft
    ? `Willst du wirklich ${count} ausgewählte Bestellungen in Gemeinschaft zurückgeben?`
    : `Willst du wirklich ${count} ausgewählte Bestellungen ${zielKuerzel} (${zielName}) zuordnen?`;
}

/**
 * Confirm-Dialog-Button-Text (Primary).
 */
export function buildZuordnungActionLabel(zielKuerzel: string): string {
  return zielKuerzel.toUpperCase() === POOL_KUERZEL ? "Zurückgeben" : "Zuordnen";
}
