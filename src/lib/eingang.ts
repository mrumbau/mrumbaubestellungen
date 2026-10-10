/**
 * Eingang (03.10.2026) — gemeinsame Konstanten fuer Seite, Zaehler und API.
 *
 * Der Rechnungsordner ist der eine Ordner, in dem nichts unbemerkt liegen
 * bleiben darf. Alles, was dort ankommt und an keiner Bestellung landet,
 * muss ein Mensch gesichtet haben, bevor es aus dem Blick verschwindet.
 * Posteingang und Versandordner duerfen stumm sein; sie sind Rauschen.
 */
export const RECHNUNGSORDNER = "In Sachen Rechnungen";

/**
 * Die vier Kontroll-Zustaende aus `v_rechnungseingang`.
 * Reihenfolge = Anzeigereihenfolge der Filter-Pillen.
 *
 * Liegt hier und nicht in der Client-Datei: Eine Server-Seite, die einen
 * Wert aus einem "use client"-Modul importiert, bekommt im Produktionsbuild
 * nur einen Verweis statt des Arrays — `.map` darauf war der 500er im Eingang.
 */
export const KONTROLLE_KEYS = [
  "ohne_bestellung",
  "aussortiert",
  "fehlgeschlagen",
  "verbucht",
] as const;

export type KontrolleKey = (typeof KONTROLLE_KEYS)[number];

/** Hoechstens so viele Mails auf einmal sichten — analog zu den Bulk-Routen. */
export const SICHTEN_MAX = 200;

/** Eine Zeile aus `eingang_zaehler(p_ordner)`: je Kontroll-Zustand Anzahl und Offen-Zahl. */
export interface EingangZaehlerZeile {
  kontrolle: string;
  anzahl: number;
  offen: number;
}

/**
 * Kopfzahlen der Eingang-Seite aus dem Ergebnis von `eingang_zaehler`
 * (10.10.2026, vorher fuenf einzelne Count-Abfragen auf die Sicht).
 *
 * Fehlende Zustaende zaehlen 0. Unbekannte Zustaende zaehlen nicht in die
 * Pillen, aber in "offen" — offen ist ein eigenes Merkmal der Mail, nicht
 * des Zustands. Zahlen koennen als Text ankommen (bigint ueber JSON).
 */
export function eingangZaehlerAus(
  zeilen: ReadonlyArray<EingangZaehlerZeile> | null | undefined,
): { counts: Record<KontrolleKey, number>; offen: number } {
  const counts = Object.fromEntries(KONTROLLE_KEYS.map((k) => [k, 0])) as Record<KontrolleKey, number>;
  let offen = 0;
  for (const z of zeilen ?? []) {
    if ((KONTROLLE_KEYS as readonly string[]).includes(z.kontrolle)) {
      counts[z.kontrolle as KontrolleKey] = Number(z.anzahl) || 0;
    }
    offen += Number(z.offen) || 0;
  }
  return { counts, offen };
}

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
