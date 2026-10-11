import { describe, it, expect } from "vitest";
import {
  bereinigeSperrgrund,
  darfEntsperren,
  darfSperren,
  istGesperrt,
  sperrFehler,
  sperrText,
} from "../sperre";

describe("bereinigeSperrgrund", () => {
  it("trimmt, entfernt HTML-Zeichen und begrenzt", () => {
    expect(bereinigeSperrgrund("  Rechnung beim <b>Anwalt</b>  ")).toBe("Rechnung beim bAnwalt/b");
    expect(bereinigeSperrgrund("a".repeat(400))).toHaveLength(300);
    expect(bereinigeSperrgrund("Zeile 1\n\n  Zeile 2")).toBe("Zeile 1 Zeile 2");
  });

  it("lehnt leere oder zu kurze Gruende ab", () => {
    expect(bereinigeSperrgrund("")).toBeNull();
    expect(bereinigeSperrgrund("   ")).toBeNull();
    expect(bereinigeSperrgrund("ok")).toBeNull();
    expect(bereinigeSperrgrund(null)).toBeNull();
    expect(bereinigeSperrgrund(42)).toBeNull();
  });
});

describe("darfSperren", () => {
  const material = { besteller_kuerzel: "CR", bestellungsart: "material" };

  it("Verwaltung und Buchhaltung immer", () => {
    expect(darfSperren({ kuerzel: "MH", rolle: "admin" }, material)).toBe(true);
    expect(darfSperren({ kuerzel: "CR", rolle: "geschaeftsfuehrer" }, material)).toBe(true);
    expect(darfSperren({ kuerzel: "NJ", rolle: "buchhaltung" }, material)).toBe(true);
  });

  it("Besteller nur eigene Material-Bestellung, SU und Abo immer", () => {
    expect(darfSperren({ kuerzel: "CR", rolle: "besteller" }, material)).toBe(true);
    expect(darfSperren({ kuerzel: "MT", rolle: "besteller" }, material)).toBe(false);
    expect(darfSperren({ kuerzel: "MT", rolle: "besteller" }, { besteller_kuerzel: "CR", bestellungsart: "subunternehmer" })).toBe(true);
    expect(darfSperren({ kuerzel: "MT", rolle: "besteller" }, { besteller_kuerzel: "CR", bestellungsart: "abo" })).toBe(true);
  });

  it("unbekannte Rolle nie", () => {
    expect(darfSperren({ kuerzel: "X", rolle: "gast" }, material)).toBe(false);
  });
});

describe("darfEntsperren", () => {
  const gesperrt = { gesperrt_am: "2026-10-11T08:00:00Z", gesperrt_von: "NJ", sperrgrund: "Anwalt" };

  it("Verwaltung immer, sonst nur der Urheber", () => {
    expect(darfEntsperren({ kuerzel: "MH", rolle: "admin" }, gesperrt)).toBe(true);
    expect(darfEntsperren({ kuerzel: "NJ", rolle: "buchhaltung" }, gesperrt)).toBe(true);
    expect(darfEntsperren({ kuerzel: "CR", rolle: "besteller" }, gesperrt)).toBe(false);
    expect(darfEntsperren({ kuerzel: "NJ", rolle: "buchhaltung" }, { gesperrt_am: gesperrt.gesperrt_am, gesperrt_von: null })).toBe(false);
  });
});

describe("istGesperrt / sperrText / sperrFehler", () => {
  it("liest den Zustand und formuliert ihn", () => {
    expect(istGesperrt(null)).toBe(false);
    expect(istGesperrt({ gesperrt_am: null })).toBe(false);
    const b = { gesperrt_am: "2026-10-11T08:00:00Z", gesperrt_von: "CR", sperrgrund: "Rechnung beim Anwalt" };
    expect(istGesperrt(b)).toBe(true);
    expect(sperrText(b)).toBe("Gesperrt von CR am 11.10.2026: Rechnung beim Anwalt");
    expect(sperrText({ gesperrt_am: null })).toBe("");
    expect(sperrFehler(b)).toBe("Rechnung ist gesperrt: Rechnung beim Anwalt");
    expect(sperrFehler({ gesperrt_am: b.gesperrt_am })).toBe("Rechnung ist gesperrt");
  });
});
