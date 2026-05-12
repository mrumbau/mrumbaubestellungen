/**
 * Geteilte Types für die Projekte-Komponenten.
 * Aus projekte-client.tsx extrahiert (12.05.2026, F6.2 Sprint 2).
 */

export interface Projekt {
  id: string;
  name: string;
  beschreibung: string | null;
  status: string;
  farbe: string;
  budget: number | null;
  kunden_id: string | null;
  kunde: string | null;
  created_at: string;
}

export interface KundeOption {
  id: string;
  name: string;
}

export interface ProjektStats {
  gesamt: number;
  offen: number;
  volumen: number;
}
