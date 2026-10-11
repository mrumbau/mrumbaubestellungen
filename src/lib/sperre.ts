/**
 * Rechnung sperren mit Grund (11.10.2026).
 *
 * Anlass: Die BFZ-Rechnung lag beim Anwalt und durfte auf keinen Fall
 * freigegeben werden. Bis dahin gab es nur "verwerfen" — das loescht den
 * Vorgang samt Belegen. Eine Sperre laesst alles stehen, blockiert aber die
 * beiden Geld-Aktionen: Freigabe und Bezahlt-Markierung.
 *
 * Die Sperre liegt quer zum Status. Eine gesperrte Bestellung behaelt ihren
 * Status (auch "freigegeben"), damit die Status-Maschine unberuehrt bleibt
 * und die Sperre jederzeit — auch nach der Freigabe, vor der Zahlung —
 * gesetzt werden kann.
 *
 * Regeln:
 *   - Sperren darf, wer die Bestellung auch freigeben duerfte, plus die
 *     Buchhaltung (sie sieht die Rechnung vor der Zahlung).
 *   - Aufheben darf die Verwaltung oder wer die Sperre gesetzt hat.
 *   - Der Grund ist Pflicht und steht ueberall dabei.
 */

import { istVerwaltung } from "./rollen";

export interface SperreFelder {
  gesperrt_am?: string | null;
  gesperrt_von?: string | null;
  sperrgrund?: string | null;
}

export interface SperreProfil {
  kuerzel: string;
  rolle: string;
}

export interface SperreBestellung extends SperreFelder {
  besteller_kuerzel?: string | null;
  bestellungsart?: string | null;
}

export const SPERRGRUND_MIN = 3;
export const SPERRGRUND_MAX = 300;

export function istGesperrt(b: SperreFelder | null | undefined): boolean {
  return !!b?.gesperrt_am;
}

/**
 * Grund fuer die Datenbank: getrimmt, ohne HTML-Sonderzeichen, begrenzt.
 * Liefert null, wenn danach zu wenig uebrig ist — dann ist es kein Grund.
 */
export function bereinigeSperrgrund(roh: unknown): string | null {
  if (typeof roh !== "string") return null;
  const grund = roh.replace(/[<>"&']/g, "").replace(/\s+/g, " ").trim().slice(0, SPERRGRUND_MAX);
  return grund.length >= SPERRGRUND_MIN ? grund : null;
}

/** Wer die Freigabe duerfte, darf auch sperren — und die Buchhaltung dazu. */
export function darfSperren(profil: SperreProfil, b: SperreBestellung): boolean {
  if (istVerwaltung(profil.rolle)) return true;
  if (profil.rolle === "buchhaltung") return true;
  if (profil.rolle !== "besteller") return false;
  const istSuOderAbo = b.bestellungsart === "subunternehmer" || b.bestellungsart === "abo";
  return istSuOderAbo || b.besteller_kuerzel === profil.kuerzel;
}

/** Aufheben: Verwaltung oder der Urheber der Sperre. */
export function darfEntsperren(profil: SperreProfil, b: SperreFelder): boolean {
  if (istVerwaltung(profil.rolle)) return true;
  return !!b.gesperrt_von && b.gesperrt_von === profil.kuerzel;
}

/** Einzeiler fuer Tooltips und Fehlermeldungen. */
export function sperrText(b: SperreFelder): string {
  if (!b.gesperrt_am) return "";
  const datum = new Date(b.gesperrt_am).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const wer = b.gesperrt_von ? ` von ${b.gesperrt_von}` : "";
  const grund = b.sperrgrund ? `: ${b.sperrgrund}` : "";
  return `Gesperrt${wer} am ${datum}${grund}`;
}

/** Fehlermeldung, wenn eine Aktion an der Sperre scheitert. */
export function sperrFehler(b: SperreFelder): string {
  return b.sperrgrund ? `Rechnung ist gesperrt: ${b.sperrgrund}` : "Rechnung ist gesperrt";
}
