import { describe, it, expect } from "vitest";
import {
  computeScore,
  computeAgeFactor,
  computeUrgencyFactor,
  clamp01,
  sortByPoolScore,
  DEFAULT_POOL_SCORE_WEIGHTS,
} from "../pool-score";

const NOW = new Date("2026-06-03T12:00:00Z");
function daysAgo(d: number): string {
  return new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000).toISOString();
}
function daysAhead(d: number): string {
  return new Date(NOW.getTime() + d * 24 * 60 * 60 * 1000).toISOString();
}

describe("clamp01", () => {
  it("klemmt Werte auf [0..1]", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01(Infinity)).toBe(0);
  });
});

describe("computeAgeFactor — 1-exp(-Δd/7)", () => {
  it("0d → 0", () => {
    expect(computeAgeFactor(NOW.toISOString(), NOW)).toBeCloseTo(0, 5);
  });
  it("~5d → 0.5", () => {
    const f = computeAgeFactor(daysAgo(5), NOW);
    expect(f).toBeGreaterThan(0.4);
    expect(f).toBeLessThan(0.6);
  });
  it("30d → nahe 1", () => {
    expect(computeAgeFactor(daysAgo(30), NOW)).toBeGreaterThan(0.95);
  });
  it("invalid → 0", () => {
    expect(computeAgeFactor("nope", NOW)).toBe(0);
    expect(computeAgeFactor(null, NOW)).toBe(0);
  });
});

describe("computeUrgencyFactor", () => {
  it("Mahnung 1. Stufe → 0.6", () => {
    expect(
      computeUrgencyFactor(daysAgo(1), 1, null, NOW),
    ).toBeCloseTo(0.6, 5);
  });
  it("Mahnung 2. Stufe → 0.8", () => {
    expect(computeUrgencyFactor(daysAgo(1), 2, null, NOW)).toBeCloseTo(0.8, 5);
  });
  it("Mahnung ≥3. Stufe → 1.0", () => {
    expect(computeUrgencyFactor(daysAgo(1), 3, null, NOW)).toBe(1);
    expect(computeUrgencyFactor(daysAgo(1), 5, null, NOW)).toBe(1);
  });
  it("Überfälligkeitsdatum → 1.0", () => {
    expect(computeUrgencyFactor(null, null, daysAgo(2), NOW)).toBe(1);
  });
  it("heute fällig (≈0d) → ~0.5", () => {
    expect(computeUrgencyFactor(null, null, NOW.toISOString(), NOW)).toBeCloseTo(0.5, 1);
  });
  it("in 5d fällig → 0", () => {
    expect(computeUrgencyFactor(null, null, daysAhead(5), NOW)).toBeCloseTo(0, 5);
  });
  it("keine Mahnung + kein Datum → 0", () => {
    expect(computeUrgencyFactor(null, null, null, NOW)).toBe(0);
  });
  it("Mahnung dominiert Fälligkeit", () => {
    const m = computeUrgencyFactor(daysAgo(1), 2, daysAhead(20), NOW);
    expect(m).toBeCloseTo(0.8, 5);
  });
});

describe("computeScore — Gesamtaggregation", () => {
  it("Default-Gewichte normalisieren auf [0..1]", () => {
    const r = computeScore(
      {
        created_at: daysAgo(30),
        vorschlag_konfidenz: 1.0,
        mahnung_am: daysAgo(2),
        mahnung_count: 3,
        haendler_id: "h1",
        projekt_id: "p1",
      },
      {
        now: NOW,
        vendorAffinity: { h1: 1 },
        projektAffinity: { p1: 1 },
      },
    );
    expect(r.total).toBeGreaterThan(0.9);
    expect(r.total).toBeLessThanOrEqual(1);
  });

  it("frischer Pool-Item ohne Vorschlag → niedriger Score", () => {
    const r = computeScore(
      { created_at: NOW.toISOString() },
      { now: NOW },
    );
    expect(r.total).toBeLessThan(0.05);
  });

  it("nur Mahnung-Stufe-3 alleine → bestimmt urgency-Anteil korrekt", () => {
    const r = computeScore(
      { created_at: NOW.toISOString(), mahnung_am: daysAgo(1), mahnung_count: 3 },
      { now: NOW },
    );
    // urgency weight = 0.25 → urgency_factor=1 → part 0.25
    // age weight = 0.3 → age_factor=0 → part 0
    // expected total = 0.25 / 1.0 = 0.25 (Sum aller weights = 1.0)
    const sumW =
      DEFAULT_POOL_SCORE_WEIGHTS.age +
      DEFAULT_POOL_SCORE_WEIGHTS.urgency +
      DEFAULT_POOL_SCORE_WEIGHTS.vorschlag_konf +
      DEFAULT_POOL_SCORE_WEIGHTS.projekt_aff +
      DEFAULT_POOL_SCORE_WEIGHTS.vendor_aff;
    expect(r.total).toBeCloseTo(0.25 / sumW, 3);
  });

  it("Custom-Weights override Defaults", () => {
    const r = computeScore(
      { created_at: NOW.toISOString(), mahnung_am: daysAgo(1), mahnung_count: 3 },
      { now: NOW, weights: { urgency: 1, age: 0, vorschlag_konf: 0, projekt_aff: 0, vendor_aff: 0 } },
    );
    expect(r.total).toBeCloseTo(1, 3);
  });

  it("Affinity-Maps verwerten haendler_id + projekt_id", () => {
    const r = computeScore(
      {
        created_at: NOW.toISOString(),
        haendler_id: "h1",
        projekt_id: "p1",
      },
      {
        now: NOW,
        vendorAffinity: { h1: 1 },
        projektAffinity: { p1: 1 },
      },
    );
    expect(r.parts.vendor_aff).toBeCloseTo(DEFAULT_POOL_SCORE_WEIGHTS.vendor_aff, 5);
    expect(r.parts.projekt_aff).toBeCloseTo(DEFAULT_POOL_SCORE_WEIGHTS.projekt_aff, 5);
  });
});

describe("sortByPoolScore", () => {
  it("sortiert deskending nach Score", () => {
    const items = [
      { id: "low", created_at: NOW.toISOString() },
      {
        id: "high",
        created_at: daysAgo(20),
        mahnung_am: daysAgo(1),
        mahnung_count: 3,
      },
      { id: "mid", created_at: daysAgo(3) },
    ];
    const sorted = sortByPoolScore(items, { now: NOW });
    expect(sorted.map((x) => x.id)).toEqual(["high", "mid", "low"]);
  });

  it("Tiebreak ist stabil (Index gewinnt)", () => {
    const items = [
      { id: "a", created_at: NOW.toISOString() },
      { id: "b", created_at: NOW.toISOString() },
    ];
    const sorted = sortByPoolScore(items, { now: NOW });
    expect(sorted.map((x) => x.id)).toEqual(["a", "b"]);
  });
});
