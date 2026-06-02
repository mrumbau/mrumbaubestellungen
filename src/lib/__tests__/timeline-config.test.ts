/**
 * Tests für timeline-config — verifiziert dass alle Event-Types kanonisch
 * registriert sind und ihre Farben + Kontext-Beschreibungen liefern.
 *
 * Phase-3-Erweiterung (02.06.2026): pool_claim / pool_reassign / pool_return
 * dürfen weder denselben Color-Token wie eine bestehende Status-/Workflow-
 * Kategorie haben (Drei-Sprachen-Disziplin), noch ohne Kontext bleiben.
 */

import { describe, it, expect } from "vitest";
import {
  TIMELINE_EVENT_CONFIG,
  timelineColor,
  type TimelineEventType,
} from "../timeline-config";

const ALL_EVENT_TYPES: TimelineEventType[] = [
  "dok",
  "abgleich_ok",
  "abgleich_abweichung",
  "freigabe",
  "kommentar",
  "mahnung",
  "bezahlt",
  "created",
  "status_changed",
  "archiviert",
  "projekt_bestaetigt",
  "bestellungsart_geaendert",
  "pool_claim",
  "pool_reassign",
  "pool_return",
];

describe("timeline-config — Kanon-Inventar", () => {
  it("alle Event-Typen haben einen Config-Eintrag mit Farbe + Kontext", () => {
    for (const typ of ALL_EVENT_TYPES) {
      const cfg = TIMELINE_EVENT_CONFIG[typ];
      expect(cfg, `Event-Type ${typ} fehlt im Config`).toBeDefined();
      expect(cfg.farbe).toMatch(/^var\(--/);
      expect(cfg.kontext.length).toBeGreaterThan(10);
    }
  });

  it("timelineColor() liefert für jeden Event-Typ einen CSS-Custom-Property-Verweis", () => {
    for (const typ of ALL_EVENT_TYPES) {
      const color = timelineColor(typ);
      expect(color).toMatch(/^var\(--/);
    }
  });
});

describe("Pool Phase 3 — Pool-Event-Typen", () => {
  it("pool_claim nutzt mr-red als Brand-Anker (Authority-Signal)", () => {
    // 02.06.2026 — Drei-Sprachen-Regel: pool_claim ist das "Mensch hat sich
    // gebunden"-Signal, deshalb Brand-Color statt Status-Token. Falls jemand
    // die Farbe ohne Begründung ändert, schlägt der Test an.
    expect(timelineColor("pool_claim")).toBe("var(--mr-red)");
  });

  it("pool_reassign nutzt feedback-info (Handover, kein Abschluss)", () => {
    expect(timelineColor("pool_reassign")).toBe("var(--feedback-info)");
  });

  it("pool_return nutzt text-secondary (neutral, wieder offen)", () => {
    expect(timelineColor("pool_return")).toBe("var(--text-secondary)");
  });

  it("pool_*-Kontext-Beschreibungen enthalten ein Verb das die Aktion erklärt", () => {
    // Damit Tooltips/Docs sinnvoll lesbar sind — kein Marker à la "Pool-Event #X".
    expect(TIMELINE_EVENT_CONFIG.pool_claim.kontext.toLowerCase()).toMatch(/übernommen|verpflichtet/);
    expect(TIMELINE_EVENT_CONFIG.pool_reassign.kontext.toLowerCase()).toMatch(/übertragen/);
    expect(TIMELINE_EVENT_CONFIG.pool_return.kontext.toLowerCase()).toMatch(/zurück|gepool|offen/);
  });
});
