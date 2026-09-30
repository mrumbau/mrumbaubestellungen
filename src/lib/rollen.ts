/**
 * Rollen und was sie duerfen (30.09.2026).
 *
 * Bis heute gab es drei Rollen: besteller, buchhaltung, admin. "Admin" war
 * dabei ein einziger Schalter fuer sehr Verschiedenes — Haendler loeschen,
 * Benutzer verwalten, E-Mail-Sync konfigurieren, aber eben auch Testdaten
 * erzeugen und Personendaten nach DSGVO unwiderruflich loeschen.
 *
 * Mit der Geschaeftsfuehrung (CR) kommt jemand dazu, der fachlich alles
 * verwalten soll, aber nichts von den beiden technischen Sachen. Deshalb
 * `geschaeftsfuehrer`: in jeder Hinsicht wie ein Admin, ausser bei den
 * Stellen, die ausdruecklich NUR_ADMIN verlangen.
 *
 * Wichtig fuer das Verstaendnis der Grenze: Zur Geschaeftsfuehrung gehoert
 * die Benutzerverwaltung, und wer Rollen vergeben darf, kann sich auch
 * selbst zum Admin machen. Der Ausschluss von Testdaten und DSGVO-Loeschung
 * ist deshalb ein Schutz vor dem Verklicken, keine Mauer gegen die eigene
 * Geschaeftsfuehrung — und so ist er auch gemeint.
 */

export const ROLLEN = ["besteller", "buchhaltung", "admin", "geschaeftsfuehrer"] as const;

export type Rolle = (typeof ROLLEN)[number];

export const ROLLEN_LABEL: Record<Rolle, string> = {
  admin: "Administrator",
  geschaeftsfuehrer: "Geschäftsführung",
  besteller: "Besteller",
  buchhaltung: "Buchhaltung",
};

/**
 * Darf verwalten — also alles, wofuer es bisher "admin" brauchte.
 *
 * Diese Funktion ist der Ersatz fuer jedes `rolle === "admin"`, das eine
 * Verwaltungsfrage stellt. Nur die beiden Ausnahmen unten fragen weiter
 * streng nach Admin.
 */
export function istVerwaltung(rolle: string | null | undefined): boolean {
  return rolle === "admin" || rolle === "geschaeftsfuehrer";
}

/**
 * Streng nur Admin. Reserviert fuer die zwei Stellen, an denen ein
 * Fehlgriff nicht zurueckzuholen ist:
 *   - Testdaten erzeugen und loeschen
 *   - DSGVO-Loeschung von Personendaten
 */
export function istNurAdmin(rolle: string | null | undefined): boolean {
  return rolle === "admin";
}

/**
 * Darf Eigentuemer einer Bestellung sein?
 *
 * Seit dem 09.06.2026 gilt: Admin-Konten bekommen keine Bestellungen, sonst
 * landen sie beim IT-Support statt bei den Leuten, die wirklich bestellen.
 * Die Geschaeftsfuehrung bestellt sehr wohl selbst — CR hat 115 Bestellungen,
 * davon 46 offene — und muss deshalb Ziel bleiben.
 */
export function darfBestellungenErhalten(rolle: string | null | undefined): boolean {
  return rolle === "besteller" || rolle === "geschaeftsfuehrer";
}

/** Rollen, die als Besteller einer Bestellung in Frage kommen (fuer DB-Filter). */
export const BESTELL_ROLLEN: readonly Rolle[] = ["besteller", "geschaeftsfuehrer"];
