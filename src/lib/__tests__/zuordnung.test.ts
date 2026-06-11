/**
 * Tests für die Zuordnungs-Helpers (09.06.2026).
 */
import { describe, it, expect } from "vitest";
import {
  POOL_KUERZEL,
  GEMEINSCHAFT_LABEL,
  getAssignableBesteller,
  buildZuordnungConfirmText,
  buildZuordnungActionLabel,
} from "../zuordnung";

const BESTELLER_LIST = [
  { kuerzel: "MT", name: "Marlon Tschon", rolle: "besteller" },
  { kuerzel: "CR", name: "Carsten Reuter", rolle: "besteller" },
  { kuerzel: "MH", name: "Mohammed Hawrami", rolle: "admin" },
  { kuerzel: "NJ", name: "Nada Jerinic", rolle: "buchhaltung" },
];

describe("getAssignableBesteller", () => {
  it("nimmt nur Besteller-Rolle, filtert Admin + Buchhaltung", () => {
    const result = getAssignableBesteller(BESTELLER_LIST, null, "MT");
    const kuerzel = result.map((o) => o.kuerzel);
    expect(kuerzel).not.toContain("MH"); // Admin raus
    expect(kuerzel).not.toContain("NJ"); // Buchhaltung raus
  });

  it("filtert eigenen Kürzel NICHT raus — Self-Claim erlaubt (v2 Korrektur)", () => {
    // Im Pool (currentOwner=null) muss MT sich auch sich selbst zuordnen können.
    const result = getAssignableBesteller(BESTELLER_LIST, null, "MT");
    expect(result.map((o) => o.kuerzel)).toContain("MT");
  });

  it("filtert aktuellen Owner raus (kein no-op)", () => {
    const result = getAssignableBesteller(BESTELLER_LIST, "CR", "MT");
    expect(result.map((o) => o.kuerzel)).not.toContain("CR");
  });

  it("hängt Gemeinschaft-Option an wenn Owner gesetzt", () => {
    const result = getAssignableBesteller(BESTELLER_LIST, "CR", "MT");
    const last = result[result.length - 1];
    expect(last.kuerzel).toBe(POOL_KUERZEL);
    expect(last.name).toBe(GEMEINSCHAFT_LABEL);
    expect(last.isGemeinschaft).toBe(true);
  });

  it("ohne Gemeinschaft wenn Owner schon Pool ist", () => {
    const result = getAssignableBesteller(BESTELLER_LIST, "UNBEKANNT", "MT");
    expect(result.find((o) => o.kuerzel === POOL_KUERZEL)).toBeUndefined();
  });

  it("ohne Gemeinschaft wenn Owner null", () => {
    const result = getAssignableBesteller(BESTELLER_LIST, null, "MT");
    expect(result.find((o) => o.kuerzel === POOL_KUERZEL)).toBeUndefined();
  });

  it("Bug-Reproduktion v2: MT sieht MT + Gemeinschaft wenn Owner=CR", () => {
    // v1-Bug: Self-Filter UND Current-Owner-Filter zusammen warfen sowohl MT
    // (self) als auch CR (owner) raus → nur Gemeinschaft. v2-Fix: Self bleibt.
    const result = getAssignableBesteller(BESTELLER_LIST, "CR", "MT");
    expect(result.map((o) => o.kuerzel)).toContain("MT");
    expect(result.map((o) => o.kuerzel)).toContain("UNBEKANNT");
    expect(result.map((o) => o.kuerzel)).not.toContain("CR"); // Owner bleibt raus
  });

  it("Pool-Übernahme: CR sieht MT + CR (kein Owner gesetzt)", () => {
    // Owner=Pool → kein Filter auf Owner; Self ist nicht mehr gefiltert.
    // MT + CR bleiben beide. Gemeinschaft NICHT angehängt (Owner ist schon Pool).
    const result = getAssignableBesteller(BESTELLER_LIST, "UNBEKANNT", "CR");
    expect(result.map((o) => o.kuerzel)).toEqual(expect.arrayContaining(["MT", "CR"]));
    expect(result.map((o) => o.kuerzel)).not.toContain("UNBEKANNT");
  });

  it("In-Arbeit-Tabelle MT-Bestellung: CR + Gemeinschaft sichtbar", () => {
    // Eingeloggter MT sieht eine eigene Bestellung in der Tabelle.
    // MT (Owner) → raus. CR + Gemeinschaft bleiben.
    const result = getAssignableBesteller(BESTELLER_LIST, "MT", "MT");
    expect(result.map((o) => o.kuerzel)).toEqual(["CR", "UNBEKANNT"]);
  });

  // 11.06.2026 — Sentinel: wenn das Dropdown nur „Gemeinschaft" zeigt
  // ist immer etwas kaputt (Daten fehlen oder Filter zu aggressiv). Test
  // fängt Regressionen sofort ab.
  it("Sentinel: bei vollständiger Liste darf das Result nie NUR Gemeinschaft sein", () => {
    for (const [owner, viewer] of [
      [null, "MT"],
      [null, "CR"],
      ["MT", "MT"],
      ["MT", "CR"],
      ["CR", "MT"],
      ["CR", "CR"],
    ] as const) {
      const result = getAssignableBesteller(BESTELLER_LIST, owner, viewer);
      const echteKuerzel = result.filter((o) => !o.isGemeinschaft).map((o) => o.kuerzel);
      expect(echteKuerzel.length, `owner=${owner} viewer=${viewer}: mind. 1 echter Besteller erwartet`).toBeGreaterThan(0);
    }
  });

  it("GP wird automatisch berücksichtigt sobald er in benutzer_rollen ist", () => {
    // User-Wunsch 11.06.2026: dritter Besteller GP. Sobald er als
    // rolle='besteller' eingetragen ist, erscheint er ohne Code-Änderung.
    const erweitert = [
      ...BESTELLER_LIST,
      { kuerzel: "GP", name: "GP Besteller", rolle: "besteller" },
    ];
    const result = getAssignableBesteller(erweitert, "MT", "MT");
    expect(result.map((o) => o.kuerzel)).toContain("GP");
    expect(result.map((o) => o.kuerzel)).toContain("CR");
  });

  it("ohne rolle-Feld (Legacy-Caller) wird durchgelassen", () => {
    const result = getAssignableBesteller(
      [{ kuerzel: "XY", name: "Test" }] as Array<{ kuerzel: string; name: string }>,
      null,
      "MT",
    );
    expect(result.map((o) => o.kuerzel)).toContain("XY");
  });

  it("zukünftiger neuer Besteller-Account taucht automatisch auf", () => {
    const erweitert = [
      ...BESTELLER_LIST,
      { kuerzel: "AB", name: "Neuer Besteller", rolle: "besteller" },
    ];
    const result = getAssignableBesteller(erweitert, "MT", "MT");
    expect(result.map((o) => o.kuerzel)).toContain("AB");
  });
});

describe("buildZuordnungConfirmText", () => {
  it("Single + echter Besteller", () => {
    const text = buildZuordnungConfirmText("CR", "Carsten Reuter", 1);
    expect(text).toContain("CR");
    expect(text).toContain("Carsten Reuter");
    expect(text).toContain("Diese Bestellung");
  });

  it("Single + Gemeinschaft", () => {
    const text = buildZuordnungConfirmText("UNBEKANNT", "Gemeinschaft", 1);
    expect(text).toContain("Gemeinschaft");
    expect(text).toContain("Diese Bestellung");
  });

  it("Bulk + echter Besteller", () => {
    const text = buildZuordnungConfirmText("MT", "Marlon Tschon", 5);
    expect(text).toContain("5");
    expect(text).toContain("MT");
  });

  it("Bulk + Gemeinschaft", () => {
    const text = buildZuordnungConfirmText("UNBEKANNT", "Gemeinschaft", 5);
    expect(text).toContain("5");
    expect(text).toContain("Gemeinschaft");
  });
});

describe("buildZuordnungActionLabel", () => {
  it("normaler Besteller liefert 'Zuordnen'", () => {
    expect(buildZuordnungActionLabel("CR")).toBe("Zuordnen");
  });

  it("Pool/Gemeinschaft liefert 'Zurückgeben'", () => {
    expect(buildZuordnungActionLabel("UNBEKANNT")).toBe("Zurückgeben");
    expect(buildZuordnungActionLabel("unbekannt")).toBe("Zurückgeben");
  });
});
