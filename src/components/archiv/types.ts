/**
 * Geteilte Types für die Archiv-Sub-Komponenten.
 * Aus archiv-client.tsx extrahiert (Block 4 Decomposition, 11.05.2026).
 */

export interface ArchivedProjekt {
  id: string;
  name: string;
  beschreibung: string | null;
  farbe: string;
  budget: number | null;
  status: string;
  created_at: string;
}

export interface PaidBestellung {
  id: string;
  bestellnummer: string | null;
  auftragsnummer?: string | null;
  lieferscheinnummer?: string | null;
  haendler_name: string | null;
  besteller_kuerzel: string;
  besteller_name: string;
  betrag: number | null;
  bezahlt_am: string;
  bezahlt_von: string | null;
  bestellungsart: string;
  projekt_id: string | null;
  projekt_name: string | null;
  hat_bestellbestaetigung: boolean;
  hat_lieferschein: boolean;
  hat_rechnung: boolean;
  hat_aufmass?: boolean;
  hat_leistungsnachweis?: boolean;
  subunternehmer_gewerk?: string | null;
  subunternehmer_firma?: string | null;
  subunternehmer_id?: string | null;
}

export interface Dokument {
  id: string;
  bestellung_id: string;
  typ: string;
  storage_pfad: string | null;
  gesamtbetrag: number | null;
  created_at: string;
  bezahlt_bereits?: boolean | null;
  zahlungsmethode?: string | null;
}

export interface ProjektStats {
  count: number;
  volumen: number;
}

export interface MonthGroup {
  key: string;
  label: string;
  items: PaidBestellung[];
  subtotal: number;
}

export type TabKey = "projekte" | "material" | "subunternehmer";
