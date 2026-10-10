/**
 * Eigene Belege erkennen (10.10.2026).
 *
 * Befund: Ein Kunde hat unsere eigene Schlussrechnung (Aussteller "MR Umbau",
 * 14.496 Euro) mit Rueckfragen zurueckgeschickt. Die Pipeline hat daraus eine
 * Subunternehmer-Bestellung mit Haendler "MR Umbau" gemacht. Eine Rechnung,
 * die wir selbst gestellt haben, ist nie eine Bestellung — egal, wer sie
 * weiterleitet.
 */

/** Schreibweisen des eigenen Firmennamens, wie die KI sie als "haendler" liefert. */
const EIGENE_NAMEN = [/\bmr[\s.-]*umbau\b/i, /\breuter[\s.-]*mr\b/i];

export function istEigeneFirma(name: string | null | undefined): boolean {
  if (!name) return false;
  return EIGENE_NAMEN.some((re) => re.test(name));
}

/**
 * Trennt die Analyse-Ergebnisse in fremde und eigene Belege. Sind ALLE
 * Belege eigene, hat die Mail fuer die Pipeline nichts zu bieten.
 */
export function ohneEigeneBelege<T extends { analyse: { haendler?: string | null } }>(
  ergebnisse: ReadonlyArray<T>,
): { fremde: T[]; eigene: T[] } {
  const fremde: T[] = [];
  const eigene: T[] = [];
  for (const e of ergebnisse) (istEigeneFirma(e.analyse.haendler) ? eigene : fremde).push(e);
  return { fremde, eigene };
}
