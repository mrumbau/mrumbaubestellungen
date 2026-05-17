/**
 * Geteilte Types für die Bestellungen-Tabelle und ihre Sub-Komponenten.
 * Aus bestellungen-tabelle.tsx extrahiert (12.05.2026, F3.3 Decomposition).
 */

import type { Bestellungsart } from "@/lib/bestellung-utils";

export interface Bestellung {
  id: string;
  bestellnummer: string | null;
  auftragsnummer?: string | null;
  lieferscheinnummer?: string | null;
  haendler_name: string | null;
  besteller_kuerzel: string;
  besteller_name: string;
  betrag: number | null;
  betrag_ist_netto?: boolean;
  waehrung: string;
  status: string;
  hat_bestellbestaetigung: boolean;
  hat_lieferschein: boolean;
  hat_rechnung: boolean;
  bestellungsart?: Bestellungsart;
  subunternehmer_name?: string | null;
  hat_versandbestaetigung?: boolean;
  projekt_id: string | null;
  projekt_name: string | null;
  mahnung_am: string | null;
  mahnung_count?: number;
  created_at: string;
  // 06.05.2026 — extrahierte Felder aus Mail/PDF
  bestelldatum?: string | null;
  faelligkeitsdatum?: string | null;
  kundennummer?: string | null;
  projekt_referenz?: string | null;
  // 07.05.2026 — Doku-Nummern für Such-Index
  doku_nummern?: string[];
  // 17.05.2026 — Gutschrift-Flag (Rückerstattung, Geld kommt zurück)
  ist_gutschrift?: boolean | null;
}

export interface ProjektOption {
  id: string;
  name: string;
  farbe: string;
}
