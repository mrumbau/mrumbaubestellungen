/**
 * Toleranz beim Abgleich (11.10.2026).
 *
 * Grosse Firmen pruefen Rechnungen gegen Bestellung und Lieferschein mit
 * einer Toleranz: ein paar Euro Rundung, Skonto oder Fracht sind keine
 * Abweichung, die jemand anfassen muss. Bis heute entschied allein die KI,
 * was eine Abweichung ist — und meldete auch 1.000,00 gegen 1.000,40.
 *
 * Regel: Ein Betragsunterschied gilt als in Ordnung, wenn er unter
 * `prozent` Prozent ODER unter `betrag` Euro liegt. So bleiben kleine
 * Differenzen bei kleinen Rechnungen (4 Euro bei 50 Euro) genauso ruhig
 * wie kleine Prozente bei grossen (1,5 Prozent bei 10.000 Euro).
 *
 * Die Werte stehen in `firma_einstellungen` (`toleranz_prozent`,
 * `toleranz_betrag`), einstellbar unter Einstellungen → System. Die Abos
 * haben weiterhin ihre eigene Toleranz je Anbieter (`abo_anbieter`).
 *
 * Angewendet wird sie zweimal: als Hinweis im Prompt des KI-Abgleichs und
 * danach deterministisch auf dessen Ergebnis (`wendeToleranzAn`), damit das
 * Verhalten nicht vom Modell abhaengt.
 */

import type { AbgleichErgebnis } from "./openai/prompts";

export interface Toleranz {
  /** Prozent, z. B. 2 fuer 2 %. */
  prozent: number;
  /** Euro, z. B. 5 fuer 5,00 €. */
  betrag: number;
}

export const TOLERANZ_DEFAULT: Toleranz = { prozent: 2, betrag: 5 };
export const TOLERANZ_SCHLUESSEL = ["toleranz_prozent", "toleranz_betrag"] as const;
export const TOLERANZ_PROZENT_MAX = 50;
export const TOLERANZ_BETRAG_MAX = 1000;

type Einstellungen =
  | ReadonlyMap<string, string>
  | Readonly<Record<string, string | undefined>>
  | ReadonlyArray<{ schluessel: string; wert: string }>;

function wert(quelle: Einstellungen, schluessel: string): string | undefined {
  if (quelle instanceof Map) return quelle.get(schluessel);
  if (Array.isArray(quelle)) return quelle.find((e) => e.schluessel === schluessel)?.wert;
  return (quelle as Record<string, string | undefined>)[schluessel];
}

/** Einstellung als Zahl im erlaubten Bereich, sonst der Standard. */
export function toleranzWert(roh: string | number | null | undefined, standard: number, max: number): number {
  const zahl = typeof roh === "number" ? roh : parseBetrag(roh ?? "");
  if (zahl === null || !Number.isFinite(zahl) || zahl < 0 || zahl > max) return standard;
  return zahl;
}

/** Toleranz aus den Firmen-Einstellungen (Map, Objekt oder Zeilenliste). */
export function leseToleranz(quelle: Einstellungen | null | undefined): Toleranz {
  if (!quelle) return { ...TOLERANZ_DEFAULT };
  return {
    prozent: toleranzWert(wert(quelle, "toleranz_prozent"), TOLERANZ_DEFAULT.prozent, TOLERANZ_PROZENT_MAX),
    betrag: toleranzWert(wert(quelle, "toleranz_betrag"), TOLERANZ_DEFAULT.betrag, TOLERANZ_BETRAG_MAX),
  };
}

/**
 * Betrag aus einem Text, wie die KI ihn liefert: "1.012,00 €", "1012.00",
 * "€ 1,012.00", "-5,00". Deutsch und englisch, Waehrung egal. null, wenn
 * da keine Zahl steht.
 */
export function parseBetrag(roh: string | number | null | undefined): number | null {
  if (typeof roh === "number") return Number.isFinite(roh) ? roh : null;
  if (!roh) return null;
  const m = String(roh).replace(/\s/g, "").match(/-?\d[\d.,]*/);
  if (!m) return null;
  let s = m[0];
  const komma = s.lastIndexOf(",");
  const punkt = s.lastIndexOf(".");
  if (komma >= 0 && punkt >= 0) {
    // Beide da: das letzte Zeichen trennt die Nachkommastellen.
    s = komma > punkt ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (komma >= 0) {
    // Ein Komma mit ein oder zwei Stellen dahinter ist deutsch ("12,50");
    // alles andere ("1,012" / "1,234,567") ist englisch tausend.
    const nach = s.length - komma - 1;
    const anzahl = (s.match(/,/g) ?? []).length;
    s = anzahl === 1 && nach <= 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (punkt >= 0) {
    // Ein Punkt mit ein oder zwei Stellen dahinter ist englisch ("12.50");
    // "1.012" und "1.234.567" sind deutsch tausend.
    const nach = s.length - punkt - 1;
    const anzahl = (s.match(/\./g) ?? []).length;
    if (!(anzahl === 1 && nach <= 2)) s = s.replace(/\./g, "");
  }
  const zahl = Number(s);
  return Number.isFinite(zahl) ? zahl : null;
}

/** Innerhalb, wenn der Unterschied unter dem Prozentsatz ODER unter dem Eurobetrag liegt. */
export function innerhalbToleranz(erwartet: number, gefunden: number, t: Toleranz): boolean {
  const diff = Math.abs(erwartet - gefunden);
  if (diff === 0) return true;
  if (diff <= t.betrag) return true;
  const basis = Math.max(Math.abs(erwartet), Math.abs(gefunden));
  return basis > 0 && (diff / basis) * 100 <= t.prozent;
}

const KEIN_BETRAG = /menge|anzahl|st(ü|ue)ck|stk|datum|nummer|\bnr\b|artikelnr|position|pos\b|datum|lieferschein|rechnungsnr/i;
const BETRAG = /betrag|preis|summe|netto|brutto|mwst|ust|steuer|total|gesamt|rabatt|skonto|fracht|versand|zwischensumme|€|eur/i;

/** Nur Geldfelder bekommen eine Toleranz — Mengen, Daten, Nummern nie. */
export function istBetragsfeld(feld: string): boolean {
  if (!feld) return false;
  if (KEIN_BETRAG.test(feld)) return false;
  return BETRAG.test(feld);
}

export function toleranzText(t: Toleranz): string {
  const prozent = t.prozent.toLocaleString("de-DE", { maximumFractionDigits: 2 });
  const betrag = t.betrag.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${prozent} % oder ${betrag} €`;
}

/**
 * Nimmt dem KI-Ergebnis die Abweichungen, die innerhalb der Toleranz liegen.
 * Bleibt nichts uebrig, ist der Abgleich "ok". Was toleriert wurde, steht
 * in der Zusammenfassung — nicht als Abweichung, aber nachlesbar.
 */
export function wendeToleranzAn(ergebnis: AbgleichErgebnis, t: Toleranz): AbgleichErgebnis {
  if (!ergebnis || !Array.isArray(ergebnis.abweichungen) || ergebnis.abweichungen.length === 0) return ergebnis;

  const bleibt: AbgleichErgebnis["abweichungen"] = [];
  const toleriert: string[] = [];
  for (const a of ergebnis.abweichungen) {
    const erwartet = parseBetrag(a.erwartet);
    const gefunden = parseBetrag(a.gefunden);
    if (istBetragsfeld(a.feld) && erwartet !== null && gefunden !== null && innerhalbToleranz(erwartet, gefunden, t)) {
      toleriert.push(`${a.feld}${a.artikel ? ` (${a.artikel})` : ""} ${a.erwartet} → ${a.gefunden}`);
    } else {
      bleibt.push(a);
    }
  }
  if (toleriert.length === 0) return ergebnis;

  const hinweis = `Innerhalb der Toleranz (${toleranzText(t)}) und deshalb keine Abweichung: ${toleriert.join("; ")}.`;
  return {
    status: bleibt.length === 0 ? "ok" : ergebnis.status,
    abweichungen: bleibt,
    zusammenfassung: `${(ergebnis.zusammenfassung ?? "").trim()} ${hinweis}`.trim(),
  };
}
