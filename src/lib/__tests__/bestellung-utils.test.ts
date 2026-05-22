/**
 * bestellung-utils Tests.
 *
 * Fokus auf reine, testbare Funktionen ohne Supabase-Dependency:
 *   - aggregatePipelineConfidence (Score-Aggregation)
 *   - DOKUMENT_CONFIG (Schema-Konsistenz mit dokumente.typ und Bestellungsart)
 *
 * `safeUpdateStatus` und `updateBestellungStatus` brauchen Supabase-Mock —
 * separat als Integration-Test wenn nötig.
 */

import { describe, it, expect } from "vitest";
import {
  aggregatePipelineConfidence,
  DOKUMENT_CONFIG,
  BESTELLUNGSART_LABELS,
  GEWERKE,
} from "../bestellung-utils";

describe("aggregatePipelineConfidence", () => {
  it("liefert 0.85 für deterministischen besteller_im_dokument", () => {
    expect(aggregatePipelineConfidence("besteller_im_dokument")).toBe(0.85);
  });

  it("liefert 0.0 für 'unbekannt'", () => {
    expect(aggregatePipelineConfidence("unbekannt")).toBe(0.0);
  });

  it("liefert Default 0.5 für unbekannte Methoden", () => {
    expect(aggregatePipelineConfidence("randomXYZ")).toBe(0.5);
  });

  it("KI-historisch: dämpft mit kiKonfidenz via geometrischem Mittel", () => {
    // base 0.72, kiKonfidenz 1.0 → sqrt(0.72) ≈ 0.848
    const result = aggregatePipelineConfidence("ki_historisch", 1.0);
    expect(result).toBeCloseTo(Math.sqrt(0.72), 3);

    // base 0.72, kiKonfidenz 0.5 → sqrt(0.36) = 0.6
    expect(aggregatePipelineConfidence("ki_historisch", 0.5)).toBeCloseTo(0.6, 3);
  });

  it("KI-historisch ohne kiKonfidenz: liefert nur base", () => {
    expect(aggregatePipelineConfidence("ki_historisch")).toBe(0.72);
    expect(aggregatePipelineConfidence("ki_historisch", null)).toBe(0.72);
  });

  it("klemmt kiKonfidenz auf [0..1]", () => {
    // out-of-range Eingaben werden geklemmt
    expect(aggregatePipelineConfidence("ki_historisch", 5)).toBeCloseTo(Math.sqrt(0.72), 3);
    expect(aggregatePipelineConfidence("ki_historisch", -1)).toBe(0);
  });

  it("Reihenfolge: text-Match > Affinität > KI bei niedriger Konfidenz", () => {
    // 22.05.2026 — bestellnummer_match/signal_4h entfernt mit Extension-Removal.
    // besteller_im_dokument ist jetzt höchste Konfidenz.
    const text = aggregatePipelineConfidence("besteller_im_dokument");
    const affin = aggregatePipelineConfidence("haendler_affinitaet");
    const kiLow = aggregatePipelineConfidence("ki_historisch", 0.3);
    expect(text).toBeGreaterThan(affin);
    expect(affin).toBeGreaterThan(kiLow);
  });
});

describe("DOKUMENT_CONFIG — Schema-Konsistenz", () => {
  it("Material hat 4 Anforderungen", () => {
    expect(DOKUMENT_CONFIG.material).toHaveLength(4);
  });

  it("Subunternehmer hat 3 Anforderungen", () => {
    expect(DOKUMENT_CONFIG.subunternehmer).toHaveLength(3);
  });

  it("Abo hat 1 Anforderung (nur Rechnung)", () => {
    expect(DOKUMENT_CONFIG.abo).toHaveLength(1);
    expect(DOKUMENT_CONFIG.abo[0].typ).toBe("rechnung");
  });

  it("alle typ-Werte sind in der DB-CHECK-Whitelist", () => {
    const erlaubteTyp = new Set([
      "bestellbestaetigung", "lieferschein", "rechnung",
      "aufmass", "leistungsnachweis", "versandbestaetigung", "unbekannt",
    ]);
    for (const art of Object.values(DOKUMENT_CONFIG)) {
      for (const anforderung of art) {
        expect(erlaubteTyp.has(anforderung.typ)).toBe(true);
      }
    }
  });

  it("Material: Rechnung + Bestätigung + Lieferschein sind erforderlich, Versand optional", () => {
    const map = Object.fromEntries(DOKUMENT_CONFIG.material.map((d) => [d.typ, d.erforderlich]));
    expect(map.bestellbestaetigung).toBe(true);
    expect(map.lieferschein).toBe(true);
    expect(map.rechnung).toBe(true);
    expect(map.versandbestaetigung).toBe(false);
  });

  it("Subunternehmer: nur Rechnung erforderlich, Aufmaß/Leistungsnachweis optional", () => {
    const map = Object.fromEntries(DOKUMENT_CONFIG.subunternehmer.map((d) => [d.typ, d.erforderlich]));
    expect(map.rechnung).toBe(true);
    expect(map.aufmass).toBe(false);
    expect(map.leistungsnachweis).toBe(false);
  });

  it("flag-Felder folgen 'hat_<typ>'-Konvention", () => {
    for (const art of Object.values(DOKUMENT_CONFIG)) {
      for (const anforderung of art) {
        expect(anforderung.flag).toMatch(/^hat_/);
      }
    }
  });
});

describe("BESTELLUNGSART_LABELS — Schema-Konsistenz mit DB-CHECK", () => {
  it("enthält alle 3 Bestellungsarten aus DB-CHECK", () => {
    expect(Object.keys(BESTELLUNGSART_LABELS).sort()).toEqual(["abo", "material", "subunternehmer"]);
  });

  it("alle Labels sind nicht-leere deutsche Strings", () => {
    for (const label of Object.values(BESTELLUNGSART_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe("GEWERKE — Whitelist", () => {
  it("enthält 'Sonstiges' als Catch-All", () => {
    expect(GEWERKE).toContain("Sonstiges");
  });

  it("alle Einträge sind eindeutig", () => {
    const set = new Set(GEWERKE);
    expect(set.size).toBe(GEWERKE.length);
  });

  it("typische Bau-Gewerke sind enthalten", () => {
    expect(GEWERKE).toContain("Elektro");
    expect(GEWERKE).toContain("Sanitär/Heizung");
    expect(GEWERKE).toContain("Trockenbau");
    expect(GEWERKE).toContain("Maler/Lackierer");
    expect(GEWERKE).toContain("Fliesen");
  });
});
