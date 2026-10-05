/**
 * Eingang (03.10.2026) — gemeinsame Konstanten fuer Seite, Zaehler und API.
 *
 * Der Rechnungsordner ist der eine Ordner, in dem nichts unbemerkt liegen
 * bleiben darf. Alles, was dort ankommt und an keiner Bestellung landet,
 * muss ein Mensch gesichtet haben, bevor es aus dem Blick verschwindet.
 * Posteingang und Versandordner duerfen stumm sein; sie sind Rauschen.
 */
export const RECHNUNGSORDNER = "In Sachen Rechnungen";

/** Hoechstens so viele Mails auf einmal sichten — analog zu den Bulk-Routen. */
export const SICHTEN_MAX = 200;

/**
 * PostgREST-Listenwert fuer `.in.(...)` innerhalb eines `.or()`-Filters.
 * Jeder Wert in doppelte Anfuehrungszeichen; Backslash und Anfuehrungszeichen
 * darin werden escaped, Kommas sind dann unschaedlich. Message-IDs enthalten
 * oft `<`, `@`, `.` und manchmal `,` — ohne Quoting zerfaellt die Liste.
 */
export function postgrestListe(werte: readonly string[]): string {
  return werte
    .map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",");
}
