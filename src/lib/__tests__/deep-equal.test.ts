/**
 * deep-equal Tests — Saved-Views Dirty-Check Foundation.
 *
 * Sicherheitskritisch: false-positive currentConfigIsDirty würde "X*"-Marker
 * permanent anzeigen. False-negative würde Save-Aufforderung verschwinden lassen.
 */

import { describe, it, expect } from "vitest";
import { deepEqual } from "../deep-equal";

describe("deepEqual — Primitives", () => {
  it("akzeptiert identische Primitives", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual("a", "a")).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
  });

  it("verwirft unterschiedliche Primitives", () => {
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual("a", "b")).toBe(false);
    expect(deepEqual(true, false)).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  it("typ-strikt: 1 !== '1'", () => {
    expect(deepEqual(1, "1")).toBe(false);
    expect(deepEqual(0, false)).toBe(false);
    expect(deepEqual("", null)).toBe(false);
  });
});

describe("deepEqual — Objects", () => {
  it("akzeptiert flache identische Objekte", () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
  });

  it("akzeptiert Objekte mit unterschiedlicher Key-Reihenfolge (DRIFT-SCHUTZ)", () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it("verwirft Objekte mit unterschiedlichen Werten", () => {
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("verwirft Objekte mit unterschiedlicher Key-Anzahl", () => {
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
  });

  it("verwirft Objekte mit unterschiedlichen Keys", () => {
    expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
  });

  it("rekursiv für nested Objekte", () => {
    expect(deepEqual(
      { a: { b: { c: 1 } } },
      { a: { b: { c: 1 } } },
    )).toBe(true);

    expect(deepEqual(
      { a: { b: { c: 1 } } },
      { a: { b: { c: 2 } } },
    )).toBe(false);
  });
});

describe("deepEqual — Arrays", () => {
  it("akzeptiert identische Arrays", () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([], [])).toBe(true);
  });

  it("verwirft Arrays mit unterschiedlicher Länge", () => {
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it("verwirft Arrays mit unterschiedlicher Reihenfolge", () => {
    expect(deepEqual([1, 2, 3], [3, 2, 1])).toBe(false);
  });

  it("verwirft Array vs Objekt mit gleichen Werten", () => {
    expect(deepEqual([1, 2], { 0: 1, 1: 2, length: 2 })).toBe(false);
  });

  it("rekursiv für nested Arrays", () => {
    expect(deepEqual([[1, 2], [3, 4]], [[1, 2], [3, 4]])).toBe(true);
    expect(deepEqual([[1, 2], [3, 4]], [[1, 2], [3, 5]])).toBe(false);
  });
});

describe("deepEqual — Realistic ViewConfig (Saved-Views)", () => {
  const viewA = {
    suche: "",
    statusFilter: "offen",
    artFilter: "material",
    projektFilter: "",
    density: "comfortable",
    sort: { key: "created_at", direction: "desc" },
  };
  // Andere Key-Reihenfolge — must equal
  const viewARearranged = {
    sort: { direction: "desc", key: "created_at" },
    density: "comfortable",
    projektFilter: "",
    artFilter: "material",
    statusFilter: "offen",
    suche: "",
  };
  const viewB = { ...viewA, statusFilter: "vollstaendig" };

  it("erkennt identische ViewConfig trotz Key-Reorder", () => {
    expect(deepEqual(viewA, viewARearranged)).toBe(true);
  });

  it("erkennt geänderten Filter-Wert", () => {
    expect(deepEqual(viewA, viewB)).toBe(false);
  });

  it("erkennt Sort-Direction-Wechsel", () => {
    const sortChanged = { ...viewA, sort: { key: "created_at", direction: "asc" as const } };
    expect(deepEqual(viewA, sortChanged)).toBe(false);
  });
});
