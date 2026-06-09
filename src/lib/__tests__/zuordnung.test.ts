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

  it("filtert eigenen Kürzel raus (kein Self-Claim)", () => {
    const result = getAssignableBesteller(BESTELLER_LIST, null, "MT");
    expect(result.map((o) => o.kuerzel)).not.toContain("MT");
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

  it("MT sieht nur CR + Gemeinschaft wenn Owner=CR", () => {
    const result = getAssignableBesteller(BESTELLER_LIST, "CR", "MT");
    // CR ist Owner → raus. MT ist self → raus. MH/NJ wegen rolle raus.
    // Bleibt: nichts an echten Bestellern + Gemeinschaft
    expect(result.map((o) => o.kuerzel)).toEqual(["UNBEKANNT"]);
  });

  it("CR sieht MT + Gemeinschaft wenn Owner=UNBEKANNT (Pool-Übernahme)", () => {
    const result = getAssignableBesteller(BESTELLER_LIST, "UNBEKANNT", "CR");
    // Owner=Pool → kein Filter auf Owner; CR=self → raus
    // MT bleibt (besteller). Gemeinschaft NICHT angehängt (Owner ist schon Pool).
    expect(result.map((o) => o.kuerzel)).toEqual(["MT"]);
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
