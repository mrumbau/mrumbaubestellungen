/**
 * Zahlungslauf (12.10.2026).
 *
 * Grosse Firmen bezahlen Rechnungen nicht einzeln, sondern in Laeufen an
 * festen Tagen — hier der 20. (einstellbar, auch mehrere Tage: "10,20").
 * Der Zahlungslauf ist die Liste dessen, was an diesem Tag ueberwiesen
 * werden muss: jede freigegebene, unbezahlte, nicht gesperrte Rechnung,
 * die vor dem NAECHSTEN Lauf faellig wird — sonst waere sie beim naechsten
 * Mal schon ueberfaellig. Rechnungen ohne Faelligkeit kommen mit hinein,
 * damit nichts liegen bleibt, und werden als solche gekennzeichnet.
 *
 * Gutschriften sind Geld, das zurueckkommt, und gehoeren nicht in einen
 * Zahlungslauf.
 */

import { istGesperrt } from "./sperre";

export const ZAHLUNGSLAUF_SCHLUESSEL = "zahlungslauf_tage";
export const ZAHLTAGE_DEFAULT: readonly number[] = [20];

export interface ZahlungslaufZeile {
  id: string;
  betrag: number | null;
  faelligkeitsdatum: string | null;
  bezahlt_am: string | null;
  archiviert_am?: string | null;
  ist_gutschrift?: boolean | null;
  gesperrt_am?: string | null;
}

export interface Zahlungslauf<T extends ZahlungslaufZeile> {
  /** Datum des Laufs (lokale Mitternacht). */
  lauf: Date;
  /** Der Lauf danach — alles, was vorher faellig wird, muss jetzt mit. */
  naechsterLauf: Date;
  zeilen: T[];
  summe: number;
  ueberfaellig: number;
  ohneFaelligkeit: number;
}

/**
 * "20" → [20], "10, 20" → [10, 20]. Nur 1 bis 28, damit jeder Monat den Tag
 * hat; Unsinn faellt heraus, leer heisst Standard.
 */
export function leseZahltage(roh: string | null | undefined): number[] {
  if (!roh) return [...ZAHLTAGE_DEFAULT];
  const tage = roh
    .split(/[,;\s]+/)
    .map((t) => Number.parseInt(t, 10))
    .filter((t) => Number.isInteger(t) && t >= 1 && t <= 28);
  const eindeutig = Array.from(new Set(tage)).sort((a, b) => a - b);
  return eindeutig.length > 0 ? eindeutig : [...ZAHLTAGE_DEFAULT];
}

function mitternacht(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Der erste Zahltag am oder nach `ab`. */
export function naechsterZahltag(tage: readonly number[], ab: Date = new Date()): Date {
  const start = mitternacht(ab);
  const sortiert = [...tage].sort((a, b) => a - b);
  for (let monat = 0; monat < 3; monat++) {
    for (const tag of sortiert) {
      const kandidat = new Date(start.getFullYear(), start.getMonth() + monat, tag);
      if (kandidat.getTime() >= start.getTime()) return kandidat;
    }
  }
  return new Date(start.getFullYear(), start.getMonth() + 1, sortiert[0] ?? 20);
}

/** Der Zahltag nach `lauf`. */
export function zahltagDanach(tage: readonly number[], lauf: Date): Date {
  const tagDanach = new Date(lauf.getFullYear(), lauf.getMonth(), lauf.getDate() + 1);
  return naechsterZahltag(tage, tagDanach);
}

function faelligVor(faelligkeitsdatum: string, grenze: Date): boolean {
  const f = new Date(faelligkeitsdatum);
  if (Number.isNaN(f.getTime())) return false;
  return mitternacht(f).getTime() < grenze.getTime();
}

/** Gehoert die Rechnung in den Lauf am `lauf`, wenn der naechste am `naechsterLauf` ist? */
export function gehoertInLauf(z: ZahlungslaufZeile, naechsterLauf: Date): boolean {
  if (z.bezahlt_am || z.archiviert_am) return false;
  if (z.ist_gutschrift) return false;
  if (istGesperrt(z)) return false;
  if (!z.faelligkeitsdatum) return true;
  return faelligVor(z.faelligkeitsdatum, naechsterLauf);
}

/** Stellt den Zahlungslauf zusammen, frueheste Faelligkeit zuerst, ohne Datum zuletzt. */
export function zahlungslauf<T extends ZahlungslaufZeile>(
  zeilen: ReadonlyArray<T>,
  tage: readonly number[],
  heute: Date = new Date(),
): Zahlungslauf<T> {
  const lauf = naechsterZahltag(tage, heute);
  const naechsterLauf = zahltagDanach(tage, lauf);
  const start = mitternacht(heute);
  const drin = zeilen
    .filter((z) => gehoertInLauf(z, naechsterLauf))
    .sort((a, b) => {
      if (!a.faelligkeitsdatum) return 1;
      if (!b.faelligkeitsdatum) return -1;
      return a.faelligkeitsdatum.localeCompare(b.faelligkeitsdatum);
    });
  return {
    lauf,
    naechsterLauf,
    zeilen: drin,
    summe: drin.reduce((s, z) => s + (z.betrag || 0), 0),
    ueberfaellig: drin.filter((z) => z.faelligkeitsdatum && faelligVor(z.faelligkeitsdatum, start)).length,
    ohneFaelligkeit: drin.filter((z) => !z.faelligkeitsdatum).length,
  };
}
