import type { Bestellungsart } from "@/lib/bestellung-utils";
import type { Tables } from "@/types/database";

/** Shared types for all /bestellungen/[id] sub-components. */

export type Dokument = {
  id: string;
  typ: string;
  quelle: string;
  storage_pfad: string | null;
  artikel: { name: string; menge: number; einzelpreis: number; gesamtpreis: number }[] | null;
  gesamtbetrag: number | null;
  netto: number | null;
  mwst: number | null;
  created_at: string;
  bestellnummer_erkannt: string | null;
  iban: string | null;
  email_betreff: string | null;
  email_absender: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ki_roh_daten: Record<string, any> | null;
};

export type Abgleich = {
  id: string;
  status: string;
  abweichungen:
    | {
        feld: string;
        artikel?: string;
        erwartet: string | number;
        gefunden: string | number;
        dokument: string;
        schwere: string;
      }[]
    | null;
  ki_zusammenfassung: string | null;
  erstellt_am: string;
};

export type Kommentar = {
  id: string;
  autor_kuerzel: string;
  autor_name: string;
  text: string;
  erstellt_am: string;
};

export type Freigabe = {
  id: string;
  freigegeben_von_name: string;
  freigegeben_am: string;
  kommentar: string | null;
};

/**
 * Welle 4 O2 — Event aus events-Tabelle für Audit-Timeline.
 *
 * 06.05.2026 (gen-types-Adoption): Type-Alias auf DB-Schema. UI nutzt nur
 * Subset. payload ist Json (string | number | boolean | null | Object | Array)
 * — bei Verwendung im UI als Record<string, unknown> casten.
 */
export type AuditEvent = Pick<
  Tables<"events">,
  "id" | "event_type" | "actor" | "payload" | "created_at"
>;

export type ProjektOption = {
  id: string;
  name: string;
  farbe: string;
  budget?: number | null;
};

export type SubunternehmerInfo = {
  id: string;
  firma: string;
  gewerk: string | null;
  ansprechpartner: string | null;
  telefon: string | null;
  email: string | null;
};

export type Bestellung = {
  id: string;
  status: string;
  bestellungsart: Bestellungsart | null;
  hat_bestellbestaetigung: boolean;
  hat_lieferschein: boolean;
  hat_rechnung: boolean;
  hat_aufmass?: boolean;
  hat_leistungsnachweis?: boolean;
  besteller_kuerzel: string;
  projekt_id: string | null;
  projekt_name: string | null;
  kunden_id: string | null;
  kunden_name: string | null;
  lieferadresse_erkannt: string | null;
  projekt_vorschlag_id: string | null;
  projekt_vorschlag_konfidenz: number | null;
  projekt_vorschlag_methode: string | null;
  projekt_vorschlag_begruendung: string | null;
  projekt_bestaetigt: boolean;
  hat_versandbestaetigung?: boolean;
  tracking_nummer?: string | null;
  versanddienstleister?: string | null;
  tracking_url?: string | null;
  voraussichtliche_lieferung?: string | null;
  mahnung_am?: string | null;
  mahnung_count?: number;
  // 06.05.2026 — extrahierte Felder aus Mail/PDF
  bestelldatum?: string | null;
  faelligkeitsdatum?: string | null;
  kundennummer?: string | null;
  projekt_referenz?: string | null;
};

export type ProjektStats = {
  gesamt_ausgaben: number;
  budget: number | null;
  budget_auslastung_prozent: number | null;
};

export type DuplikatResult = {
  ist_duplikat: boolean;
  konfidenz: number;
  duplikat_von: string | null;
  begruendung: string;
};

export type KatResult = {
  kategorien: { artikel: string; kategorie: string }[];
  zusammenfassung: Record<string, number>;
};

/**
 * Widget-IDs für die kollabierbaren Sidebar/Mobile-Widgets.
 * Desktop-Sidebar und Mobile-Details haben separate Accordion-Gruppen,
 * deshalb sind die IDs explizit doppelt (Desktop vs. mobile-prefix `m-`).
 */
export type WidgetId =
  | "timeline"
  | "audit-trail"
  | "kommentare"
  | "ki-tools"
  | "m-timeline"
  | "m-audit-trail"
  | "m-kommentare"
  | "m-ki-tools";
