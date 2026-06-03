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
  // 02.06.2026 (Pool Phase 1) — Pipeline-Vorschlag-Provenance (optional).
  // Wird in BestellerCell als ghost-Pill angezeigt wenn besteller_kuerzel
  // UNBEKANNT ist. Bleibt auch nach Claim erhalten (Audit-Anker).
  vorschlag_kuerzel?: string | null;
  vorschlag_konfidenz?: number | null;
  // 03.06.2026 (Pool 2.0 Sprint 3) — Auto-Claim-Pin + Score-Affinity.
  // haendler_id wird für vw_user_vendor_affinity-Lookup gebraucht.
  // zuordnung_methode startsWith `auto_high_confidence:` markiert
  // Pipeline-Auto-Übernahmen — UI zeigt Roboter-Pin + 24h-Korrektur-CTA.
  haendler_id?: string | null;
  zuordnung_methode?: string | null;
  updated_at?: string | null;
}

export interface ProjektOption {
  id: string;
  name: string;
  farbe: string;
}
