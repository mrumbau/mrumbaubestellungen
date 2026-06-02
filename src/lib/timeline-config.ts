/**
 * Timeline-Konfiguration — zentrale Quelle für Activity-Feed-Visualisierung.
 *
 * Pro Event-Typ:
 *   - `farbe`:  CSS-Variable für Dot/Inset-Bar (analog zu `status-config.ts`)
 *   - `kontext`: Doku-Hint, in welcher Phase des Workflows das Event auftritt
 *
 * Bei Erweiterung: neuen Event-Typ hier registrieren, dann in `buildTimeline()`
 * referenzieren. Single source of truth.
 */
export type TimelineEventType =
  | "dok"
  | "abgleich_ok"
  | "abgleich_abweichung"
  | "freigabe"
  | "kommentar"
  | "mahnung"
  | "bezahlt"
  // 06.05.2026 (Welle 4 O2) — neue Event-Types aus events-Tabelle
  | "created"
  | "status_changed"
  | "archiviert"
  | "projekt_bestaetigt"
  | "bestellungsart_geaendert"
  // 02.06.2026 (Pool Phase 3) — Pool-Events. Color-Wahl:
  // pool_claim nutzt mr-red (Authority — jemand hat sich gebunden), pool_return
  // text-secondary (neutral, "zurück geöffnet"), pool_reassign info-Token
  // (Handover-Event, kein Abschluss). Konsistent mit Drei-Sprachen-Disziplin.
  | "pool_claim"
  | "pool_reassign"
  | "pool_return";

export const TIMELINE_EVENT_CONFIG: Record<
  TimelineEventType,
  { farbe: string; kontext: string }
> = {
  dok: {
    farbe: "var(--text-secondary)",
    kontext: "Dokument-Eingang (info-event)",
  },
  abgleich_ok: {
    farbe: "var(--status-vollstaendig)",
    kontext: "KI-Abgleich abgeschlossen, alles OK",
  },
  abgleich_abweichung: {
    farbe: "var(--status-abweichung)",
    kontext: "KI-Abgleich hat Abweichung gefunden",
  },
  freigabe: {
    farbe: "var(--status-freigegeben)",
    kontext: "Bestellung an Buchhaltung freigegeben",
  },
  kommentar: {
    farbe: "var(--text-tertiary)",
    kontext: "Manueller Kommentar von Besteller/Admin",
  },
  mahnung: {
    farbe: "var(--status-ls-fehlt)",
    kontext: "Mahnung an Händler verschickt",
  },
  bezahlt: {
    farbe: "var(--status-freigegeben)",
    kontext: "Rechnung als bezahlt markiert (DATEV-Export)",
  },
  created: {
    farbe: "var(--mr-red)",
    kontext: "Bestellung wurde angelegt",
  },
  status_changed: {
    farbe: "var(--text-secondary)",
    kontext: "Status-Wechsel im Workflow",
  },
  archiviert: {
    farbe: "var(--text-tertiary)",
    kontext: "Bestellung archiviert (GoBD-konform)",
  },
  projekt_bestaetigt: {
    farbe: "var(--mr-red)",
    kontext: "Projekt-Vorschlag bestätigt",
  },
  bestellungsart_geaendert: {
    farbe: "var(--text-secondary)",
    kontext: "Bestellungsart manuell geändert (material/subunternehmer/abo)",
  },
  pool_claim: {
    farbe: "var(--mr-red)",
    kontext: "Aus Pool übernommen — Besteller hat sich der Bestellung verpflichtet",
  },
  pool_reassign: {
    farbe: "var(--feedback-info)",
    kontext: "Bestellung an anderen Besteller übertragen",
  },
  pool_return: {
    farbe: "var(--text-secondary)",
    kontext: "Zurück in den Pool gegeben — wieder offen für alle Besteller",
  },
};

export function timelineColor(typ: TimelineEventType): string {
  return TIMELINE_EVENT_CONFIG[typ].farbe;
}
