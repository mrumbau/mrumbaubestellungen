/**
 * Tests für die pure Presence-Helper.
 *
 * Der Hook selbst (useBestellungPresence) wird nicht getestet — er kapselt
 * Side-Effects (Supabase-Subscription, useState) die nur in einer DOM-/React-
 * Test-Environment Sinn ergeben. vitest läuft hier im Node-Env (siehe
 * vitest.config). Stattdessen testen wir die isoliert exportierten Funktionen.
 *
 * 02.06.2026 (Pool Phase 4).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  dedupeViewers,
  formatPresenceJoined,
  type PresenceViewer,
} from "../use-bestellung-presence";

function viewer(kuerzel: string, joined_at: string, name?: string): PresenceViewer {
  return { kuerzel, name: name ?? kuerzel, joined_at };
}

describe("dedupeViewers", () => {
  it("filtert den aktuellen User raus (Self-Exclusion)", () => {
    const raw = [
      viewer("MT", "2026-06-02T10:00:00Z"),
      viewer("CR", "2026-06-02T10:05:00Z"),
    ];
    const result = dedupeViewers(raw, "MT");
    expect(result).toHaveLength(1);
    expect(result[0].kuerzel).toBe("CR");
  });

  it("dedupt mehrere Tabs desselben Users (älteste joined_at gewinnt)", () => {
    const raw = [
      viewer("CR", "2026-06-02T10:10:00Z"),
      viewer("CR", "2026-06-02T10:05:00Z"), // ältere Tab
      viewer("CR", "2026-06-02T10:15:00Z"),
    ];
    const result = dedupeViewers(raw, "MT");
    expect(result).toHaveLength(1);
    expect(result[0].joined_at).toBe("2026-06-02T10:05:00Z");
  });

  it("sortiert nach ältester joined_at zuerst", () => {
    const raw = [
      viewer("CR", "2026-06-02T10:10:00Z"),
      viewer("MH", "2026-06-02T10:05:00Z"),
      viewer("NJ", "2026-06-02T10:08:00Z"),
    ];
    const result = dedupeViewers(raw, "MT");
    expect(result.map((v) => v.kuerzel)).toEqual(["MH", "NJ", "CR"]);
  });

  it("ignoriert Einträge ohne Kürzel (defensive)", () => {
    const raw = [
      viewer("", "2026-06-02T10:00:00Z"),
      viewer("CR", "2026-06-02T10:05:00Z"),
    ];
    const result = dedupeViewers(raw, "MT");
    expect(result.map((v) => v.kuerzel)).toEqual(["CR"]);
  });

  it("leerer Input → leeres Result, kein Crash", () => {
    expect(dedupeViewers([], "MT")).toEqual([]);
  });

  it("nur Self → leeres Result (kein Banner für mich allein)", () => {
    const raw = [
      viewer("MT", "2026-06-02T10:00:00Z"),
      viewer("MT", "2026-06-02T10:05:00Z"),
    ];
    expect(dedupeViewers(raw, "MT")).toEqual([]);
  });
});

describe("formatPresenceJoined", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("< 1 Min → 'gerade eben'", () => {
    expect(formatPresenceJoined("2026-06-02T11:59:30Z")).toBe("gerade eben");
  });

  it("2 Min → 'seit 2 Min.'", () => {
    expect(formatPresenceJoined("2026-06-02T11:58:00Z")).toBe("seit 2 Min.");
  });

  it("59 Min → 'seit 59 Min.'", () => {
    expect(formatPresenceJoined("2026-06-02T11:01:00Z")).toBe("seit 59 Min.");
  });

  it("3 Std → 'seit 3 Std.'", () => {
    expect(formatPresenceJoined("2026-06-02T09:00:00Z")).toBe("seit 3 Std.");
  });

  it(">24 Std → 'seit über einem Tag'", () => {
    expect(formatPresenceJoined("2026-05-31T12:00:00Z")).toBe("seit über einem Tag");
  });
});
