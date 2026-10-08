/**
 * Warum haengt ein Dokument an dieser Bestellung? (08.10.2026)
 *
 * Die Pipeline hat das bisher nirgends festgehalten: 353 Dokumente in 90
 * Tagen, bei keinem war nachvollziehbar, ob die Bestellnummer passte oder
 * nur der Haendler. Jetzt schreibt sie die Methode in
 * `dokumente.ki_roh_daten._zuordnung`, und die Detailseite zeigt sie an —
 * mit Warnung, wenn die Zuordnung nur geraten war.
 */
export type ZuordnungsMethode =
  | "manuell"
  | "bestellnummer"
  | "bestellnummer_aehnlich"
  | "querverweis"
  | "haendler_offen"
  | "neu";

export interface ZuordnungsBegruendung {
  methode: ZuordnungsMethode;
  /** Die Nummer, ueber die zugeordnet wurde (wenn es eine gab). */
  nummer?: string | null;
}

const UNSICHER: ReadonlySet<ZuordnungsMethode> = new Set([
  "bestellnummer_aehnlich",
  "querverweis",
  "haendler_offen",
]);

export function beschreibeZuordnung(z: ZuordnungsBegruendung): { text: string; unsicher: boolean } {
  const nr = z.nummer ? ` ${z.nummer}` : "";
  const texte: Record<ZuordnungsMethode, string> = {
    manuell: "von Hand zugeordnet",
    bestellnummer: `Bestellnummer${nr} stimmt überein`,
    bestellnummer_aehnlich: `Nummer${nr} nur ähnlich, bitte prüfen`,
    querverweis: `über Querverweis${nr} ohne Händlerabgleich, bitte prüfen`,
    haendler_offen: "gleicher Händler, offener Vorgang, keine passende Nummer, bitte prüfen",
    neu: "neue Bestellung aus dieser Mail",
  };
  return { text: texte[z.methode], unsicher: UNSICHER.has(z.methode) };
}

/** Liest die Begruendung aus den Rohdaten eines Dokuments, wenn sie da ist. */
export function zuordnungAus(kiRohDaten: unknown): ZuordnungsBegruendung | null {
  if (!kiRohDaten || typeof kiRohDaten !== "object") return null;
  const z = (kiRohDaten as { _zuordnung?: unknown })._zuordnung;
  if (!z || typeof z !== "object") return null;
  const methode = (z as { methode?: unknown }).methode;
  if (typeof methode !== "string" || !(methode in METHODEN)) return null;
  const nummer = (z as { nummer?: unknown }).nummer;
  return { methode: methode as ZuordnungsMethode, nummer: typeof nummer === "string" ? nummer : null };
}

const METHODEN: Record<ZuordnungsMethode, true> = {
  manuell: true,
  bestellnummer: true,
  bestellnummer_aehnlich: true,
  querverweis: true,
  haendler_offen: true,
  neu: true,
};
