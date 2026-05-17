/**
 * Geteilte Types + Helpers für Buchhaltung.
 * Aus buchhaltung-client.tsx extrahiert (12.05.2026, F4.7 Sprint 2).
 */

export interface BuchhaltungRow {
  // 07.05.2026 — id ist jetzt die DOKUMENT-ID (Rechnungs-Beleg), nicht mehr
  // die Bestellungs-ID. Eine Bestellung mit n Teil-Rechnungen erscheint als
  // n Zeilen, jede mit eigener Doku-id.
  id: string;
  bestellung_id: string;
  bestellnummer: string | null;
  haendler_name: string | null;
  betrag: number | null;
  waehrung: string;
  freigegeben_von: string;
  freigegeben_am: string | null;
  faelligkeitsdatum: string | null;
  rechnung_id: string | null;
  bezahlt_am: string | null;
  bezahlt_von: string | null;
  archiviert_am: string | null;
  bestellungsart?: "material" | "subunternehmer" | "abo" | null;
  hat_bestellbestaetigung?: boolean;
  hat_lieferschein?: boolean;
  mahnung_am?: string | null;
  mahnung_count?: number;
  bestelldatum?: string | null;
  kundennummer?: string | null;
  projekt_referenz?: string | null;
  // 17.05.2026 — Gutschrift-Flag. Buchhaltung markiert die Zeile grün +
  // Label „GUTSCHRIFT". Betrag-Vorzeichen-Anzeige (+ statt -) plus eigener
  // Bezahlt-Sinn: bei Gutschrift = "Geld erhalten" statt "Geld überwiesen".
  ist_gutschrift?: boolean;
}

export function isFaelligBald(datum: string | null) {
  if (!datum) return false;
  const diff = new Date(datum).getTime() - Date.now();
  return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
}

export function isUeberfaellig(datum: string | null) {
  if (!datum) return false;
  return new Date(datum).getTime() < Date.now();
}
