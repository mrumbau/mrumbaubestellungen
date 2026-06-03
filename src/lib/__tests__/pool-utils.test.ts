import { describe, it, expect } from "vitest";
import {
  ageInDays,
  bucketAge,
  agingWashClass,
  agingWashFromCreatedAt,
  describeAge,
} from "../pool-utils";

const NOW = new Date("2026-06-03T12:00:00Z");

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("ageInDays", () => {
  it("returns 0 for now", () => {
    expect(ageInDays(NOW.toISOString(), NOW)).toBeCloseTo(0, 2);
  });

  it("returns 1 for one day ago", () => {
    expect(ageInDays(daysAgo(1), NOW)).toBeCloseTo(1, 2);
  });

  it("returns 14 for two weeks ago", () => {
    expect(ageInDays(daysAgo(14), NOW)).toBeCloseTo(14, 2);
  });

  it("returns 0 for invalid date", () => {
    expect(ageInDays("not-a-date", NOW)).toBe(0);
  });

  it("never returns negative (future date clamps to 0)", () => {
    expect(ageInDays(daysAgo(-3), NOW)).toBe(0);
  });
});

describe("bucketAge — 4-state aging classification", () => {
  it("0-2d → fresh", () => {
    expect(bucketAge(0)).toBe("fresh");
    expect(bucketAge(1)).toBe("fresh");
    expect(bucketAge(2)).toBe("fresh");
  });

  it("2-7d → ripening", () => {
    expect(bucketAge(2.5)).toBe("ripening");
    expect(bucketAge(7)).toBe("ripening");
  });

  it("7-14d → stale (löst amber-wash aus)", () => {
    expect(bucketAge(7.5)).toBe("stale");
    expect(bucketAge(14)).toBe("stale");
  });

  it(">14d → rotting (löst rose-wash aus)", () => {
    expect(bucketAge(15)).toBe("rotting");
    expect(bucketAge(60)).toBe("rotting");
  });
});

describe("agingWashClass — Drei-Sprachen-Disziplin v2 (Token-basierte Aging-Wash)", () => {
  it("fresh + ripening → kein Wash (null)", () => {
    expect(agingWashClass("fresh")).toBeNull();
    expect(agingWashClass("ripening")).toBeNull();
  });

  // UX-R1 (03.06.2026): Wash wurde von amber-50/40 + rose-50/40 (Tailwind-
  // Defaults) auf semantische Tokens (bg-aging-stale, bg-aging-rotting) in
  // globals.css migriert. Tests prüfen jetzt die Token-Klassen statt der
  // Default-Color-Namen.
  it("stale → bg-aging-stale Token (Stufe 3)", () => {
    expect(agingWashClass("stale")).toBe("bg-aging-stale");
  });

  it("rotting → bg-aging-rotting Token (Stufe 3, urgent)", () => {
    expect(agingWashClass("rotting")).toBe("bg-aging-rotting");
  });
});

describe("agingWashFromCreatedAt — End-to-End", () => {
  it("frische Bestellung → null", () => {
    expect(agingWashFromCreatedAt(daysAgo(1), NOW)).toBeNull();
  });

  it("8 Tage alt → bg-aging-stale", () => {
    expect(agingWashFromCreatedAt(daysAgo(8), NOW)).toBe("bg-aging-stale");
  });

  it("20 Tage alt → bg-aging-rotting", () => {
    expect(agingWashFromCreatedAt(daysAgo(20), NOW)).toBe("bg-aging-rotting");
  });

  it("null Input → null", () => {
    expect(agingWashFromCreatedAt(null, NOW)).toBeNull();
    expect(agingWashFromCreatedAt(undefined, NOW)).toBeNull();
  });
});

describe("describeAge — deutsche Microcopy", () => {
  it("< 1 Tag → 'seit weniger als einem Tag'", () => {
    expect(describeAge(0.5)).toBe("seit weniger als einem Tag");
  });

  it("genau 1 Tag → singular", () => {
    expect(describeAge(1)).toBe("seit einem Tag");
  });

  it("3 Tage → 'seit 3 Tagen'", () => {
    expect(describeAge(3)).toBe("seit 3 Tagen");
  });

  it("7-13 Tage → 'über einer Woche'", () => {
    expect(describeAge(8)).toBe("seit über einer Woche");
  });

  it("14-29 Tage → 'über zwei Wochen'", () => {
    expect(describeAge(20)).toBe("seit über zwei Wochen");
  });

  it("30+ Tage → 'über einem Monat'", () => {
    expect(describeAge(45)).toBe("seit über einem Monat");
  });
});
