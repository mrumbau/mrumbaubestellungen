/**
 * Selbsttest (08.10.2026) — reine Bewertungslogik, ohne Netz und Datenbank.
 *
 * Hintergrund: /eingang hat vom 05.10. bis 07.10. einen Serverfehler
 * geliefert, und niemand hat es gemerkt, weil Build und Tests die Seite
 * nicht ausfuehren. Der Selbsttest laedt deshalb einmal am Tag jede
 * Hauptseite so, wie ein angemeldeter Nutzer sie sieht, und meldet sich,
 * wenn eine davon nicht mehr antwortet.
 */

/** Seiten, die ein Admin taeglich sehen koennen muss. */
export const SELBSTTEST_SEITEN = [
  "/dashboard",
  "/bestellungen/pool",
  "/bestellungen/in-arbeit",
  "/bestellungen/archiv",
  "/eingang",
  "/buchhaltung",
  "/einstellungen",
  "/einstellungen/system",
] as const;

export const SELBSTTEST_EMAIL = "selbsttest@mrumbau.de";
export const SELBSTTEST_KUERZEL = "ST";

export type SeitenErgebnis = {
  pfad: string;
  ok: boolean;
  status: number;
  dauerMs: number;
  /** Nur bei Fehler: was genau nicht gepasst hat. */
  grund?: string;
};

/**
 * Bewertet eine geladene Seite. Eine Seite gilt als in Ordnung, wenn sie
 * mit 200 antwortet, die Next.js-Fehlerseite nicht enthaelt und eine
 * Ueberschrift hat. Eine Umleitung (z.B. nach /login) ist ein Fehler, weil
 * dann die Anmeldung des Pruefkontos nicht funktioniert hat.
 */
export function bewerteSeite(input: {
  pfad: string;
  status: number;
  html: string;
  dauerMs: number;
  location?: string | null;
}): SeitenErgebnis {
  const basis = { pfad: input.pfad, status: input.status, dauerMs: input.dauerMs };
  if (input.status >= 300 && input.status < 400) {
    return { ...basis, ok: false, grund: `Umleitung nach ${input.location ?? "unbekannt"}` };
  }
  if (input.status !== 200) {
    return { ...basis, ok: false, grund: `HTTP ${input.status}` };
  }
  if (/Application error|server-side exception/i.test(input.html)) {
    return { ...basis, ok: false, grund: "Next.js-Fehlerseite" };
  }
  if (!/<h1[\s>]/i.test(input.html)) {
    return { ...basis, ok: false, grund: "keine Ueberschrift im HTML" };
  }
  return { ...basis, ok: true };
}

/**
 * Eine Zeile pro Seite plus Kopfzeile — so landet es im Log und in der Mail.
 */
export function fasseZusammen(ergebnisse: SeitenErgebnis[]): { ok: boolean; text: string } {
  const fehler = ergebnisse.filter((e) => !e.ok);
  const gesamtMs = ergebnisse.reduce((s, e) => s + e.dauerMs, 0);
  const kopf = fehler.length === 0
    ? `${ergebnisse.length} Seiten in Ordnung (${(gesamtMs / 1000).toFixed(1)} s)`
    : `${fehler.length} von ${ergebnisse.length} Seiten fehlerhaft`;
  const zeilen = ergebnisse.map((e) =>
    e.ok
      ? `OK      ${e.pfad} (${e.dauerMs} ms)`
      : `FEHLER  ${e.pfad}: ${e.grund} (HTTP ${e.status}, ${e.dauerMs} ms)`,
  );
  return { ok: fehler.length === 0, text: [kopf, ...zeilen].join("\n") };
}
