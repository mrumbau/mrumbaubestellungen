/**
 * safeCompare Tests — Timing-Safe Secret-Compare.
 *
 * Sicherheitskritisch: webhook/email + cron-Routes nutzen safeCompare gegen
 * MAKE_WEBHOOK_SECRET, CRON_SECRET. Bei Bug → entweder Timing-Side-Channel-Leak
 * oder False-Positives die Auth umgehen.
 */

import { describe, it, expect } from "vitest";
import { safeCompare } from "../safe-compare";

describe("safeCompare — Auth-Critical", () => {
  it("liefert true bei identischen Strings", () => {
    expect(safeCompare("secret123", "secret123")).toBe(true);
    expect(safeCompare("a", "a")).toBe(true);
  });

  it("liefert false bei unterschiedlichen Strings", () => {
    expect(safeCompare("secret", "wrong")).toBe(false);
    expect(safeCompare("admin", "Admin")).toBe(false); // case-sensitive
  });

  it("liefert false bei unterschiedlicher Länge", () => {
    expect(safeCompare("short", "longerstring")).toBe(false);
    expect(safeCompare("abc", "abcd")).toBe(false);
  });

  it("liefert false bei null/undefined/leerem String — KEIN false-positive", () => {
    expect(safeCompare(null, null)).toBe(false);
    expect(safeCompare(undefined, undefined)).toBe(false);
    expect(safeCompare("", "")).toBe(false);
    expect(safeCompare(null, "secret")).toBe(false);
    expect(safeCompare("secret", null)).toBe(false);
    expect(safeCompare(undefined, "secret")).toBe(false);
    expect(safeCompare("", "secret")).toBe(false);
  });

  it("liefert false bei nicht-vorhandener vs. leerer ENV-Var (typischer Misconfiguration-Fall)", () => {
    const envValue = process.env.NONEXISTENT_VAR; // undefined
    expect(safeCompare("user-input", envValue)).toBe(false);
  });

  it("ist Unicode-sicher", () => {
    expect(safeCompare("Geheimnüß", "Geheimnüß")).toBe(true);
    expect(safeCompare("Geheimnüß", "Geheimnüss")).toBe(false);
  });
});
