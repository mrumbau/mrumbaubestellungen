/**
 * time-range Tests — Dashboard-Zeitraum-Berechnung.
 *
 * Wird Server + Client identisch genutzt für Filter-Bounds + Sparkline-Buckets.
 * Drift zwischen Server-Filter und Client-Aggregation würde Daten-Inkonsistenz
 * im Dashboard erzeugen.
 */

import { describe, it, expect } from "vitest";
import { isValidTimeRange, parseTimeRange, computeRangeBounds, sparklineBuckets } from "../time-range";

describe("isValidTimeRange", () => {
  it("akzeptiert die 5 gültigen Werte", () => {
    expect(isValidTimeRange("7d")).toBe(true);
    expect(isValidTimeRange("30d")).toBe(true);
    expect(isValidTimeRange("90d")).toBe(true);
    expect(isValidTimeRange("month")).toBe(true);
    expect(isValidTimeRange("prev-month")).toBe(true);
  });

  it("verwirft alles andere", () => {
    expect(isValidTimeRange("1d")).toBe(false);
    expect(isValidTimeRange("year")).toBe(false);
    expect(isValidTimeRange("")).toBe(false);
    expect(isValidTimeRange(null)).toBe(false);
    expect(isValidTimeRange(undefined)).toBe(false);
    expect(isValidTimeRange(7)).toBe(false);
  });
});

describe("parseTimeRange — Default-Behavior", () => {
  it("liefert valid-Wert unverändert zurück", () => {
    expect(parseTimeRange("7d")).toBe("7d");
    expect(parseTimeRange("month")).toBe("month");
  });

  it("liefert '30d' als Default bei Müll/null/undefined", () => {
    expect(parseTimeRange(null)).toBe("30d");
    expect(parseTimeRange(undefined)).toBe("30d");
    expect(parseTimeRange("garbage")).toBe("30d");
    expect(parseTimeRange("")).toBe("30d");
  });
});

describe("computeRangeBounds — 7d/30d/90d", () => {
  // Fixed reference date for reproducibility (Mittwoch 6. Mai 2026 um 14:30)
  const NOW = new Date(2026, 4, 6, 14, 30);

  it("7d: Start vor 6 Tagen, durationDays = 7", () => {
    const r = computeRangeBounds("7d", NOW);
    expect(r.durationDays).toBe(7);
    expect(r.label).toBe("Letzte 7 Tage");
    // start = today - 6 days @ 00:00
    const expectedStart = new Date(2026, 3, 30); // 30. April
    expect(r.start.toDateString()).toBe(expectedStart.toDateString());
  });

  it("30d: Start vor 29 Tagen, durationDays = 30", () => {
    const r = computeRangeBounds("30d", NOW);
    expect(r.durationDays).toBe(30);
    expect(r.label).toBe("Letzte 30 Tage");
    // start = today - 29 days
    const expectedStart = new Date(2026, 3, 7); // 7. April
    expect(r.start.toDateString()).toBe(expectedStart.toDateString());
  });

  it("90d: Start vor 89 Tagen, durationDays = 90", () => {
    const r = computeRangeBounds("90d", NOW);
    expect(r.durationDays).toBe(90);
    expect(r.label).toBe("Letzte 90 Tage");
  });

  it("previousStart/End ist gleich lange Periode davor (für MoM-Delta)", () => {
    const r = computeRangeBounds("30d", NOW);
    const currentLengthMs = r.end.getTime() - r.start.getTime();
    const previousLengthMs = r.previousEnd.getTime() - r.previousStart.getTime();
    // Toleranz für Rundungs-Offset (±1 Tag)
    expect(Math.abs(currentLengthMs - previousLengthMs)).toBeLessThan(48 * 60 * 60 * 1000);
    expect(r.previousEnd.getTime()).toBeLessThan(r.start.getTime());
  });
});

describe("computeRangeBounds — month/prev-month", () => {
  it("month: aktueller Kalendermonat (start = 1. des Monats)", () => {
    const NOW = new Date(2026, 4, 15); // 15. Mai 2026
    const r = computeRangeBounds("month", NOW);
    expect(r.start.getDate()).toBe(1);
    expect(r.start.getMonth()).toBe(4); // May
    expect(r.label).toContain("Mai");
    expect(r.label).toContain("2026");
  });

  it("prev-month: Vormonat komplett (start=1., end=Monatsende 23:59)", () => {
    const NOW = new Date(2026, 4, 15); // Mitte Mai
    const r = computeRangeBounds("prev-month", NOW);
    expect(r.start.getMonth()).toBe(3); // April
    expect(r.start.getDate()).toBe(1);
    expect(r.end.getMonth()).toBe(3); // April
    expect(r.end.getDate()).toBe(30); // April hat 30 Tage
    expect(r.end.getHours()).toBe(23);
    expect(r.label).toContain("April");
  });

  it("prev-month bei Januar → Dezember Vorjahr", () => {
    const NOW = new Date(2026, 0, 15); // Januar 2026
    const r = computeRangeBounds("prev-month", NOW);
    expect(r.start.getFullYear()).toBe(2025);
    expect(r.start.getMonth()).toBe(11); // Dezember
  });
});

describe("sparklineBuckets — Bucket-Granularität", () => {
  it("7d → 7 tägliche Buckets", () => {
    const NOW = new Date(2026, 4, 6, 12, 0);
    const bounds = computeRangeBounds("7d", NOW);
    const buckets = sparklineBuckets(bounds);
    expect(buckets).toHaveLength(7);
    // Jeder Bucket = 1 Tag
    for (const b of buckets) {
      const hours = (b.end.getTime() - b.start.getTime()) / (60 * 60 * 1000);
      expect(hours).toBeGreaterThan(0);
      expect(hours).toBeLessThanOrEqual(25); // tolerance for end-of-range clamp
    }
  });

  it("30d → 30 tägliche Buckets", () => {
    const NOW = new Date(2026, 4, 6, 12, 0);
    const bounds = computeRangeBounds("30d", NOW);
    const buckets = sparklineBuckets(bounds);
    expect(buckets).toHaveLength(30);
  });

  it("90d → wöchentliche Buckets (~13 statt 90)", () => {
    const NOW = new Date(2026, 4, 6, 12, 0);
    const bounds = computeRangeBounds("90d", NOW);
    const buckets = sparklineBuckets(bounds);
    // 90 / 7 = 12.857 → ceil = 13
    expect(buckets).toHaveLength(13);
  });

  it("durationDays = 0 sollte mindestens 1 Bucket liefern", () => {
    const fakeBounds = {
      start: new Date(),
      end: new Date(),
      previousStart: new Date(),
      previousEnd: new Date(),
      label: "test",
      durationDays: 0,
    };
    const buckets = sparklineBuckets(fakeBounds);
    expect(buckets.length).toBeGreaterThanOrEqual(1);
  });
});
