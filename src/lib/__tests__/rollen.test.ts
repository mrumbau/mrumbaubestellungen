/**
 * Tests fuer die Rollen-Logik.
 *
 * Der teuerste Fehler waere hier still: eine Rolle, die zu viel darf, faellt
 * niemandem auf. Deshalb pruefen diese Tests beide Richtungen fuer jede
 * Rolle einzeln, statt nur den erwarteten Normalfall.
 */
import { describe, it, expect } from "vitest";
import {
  ROLLEN,
  istVerwaltung,
  istNurAdmin,
  darfBestellungenErhalten,
} from "../rollen";

describe("istVerwaltung", () => {
  it("gilt fuer Admin und Geschaeftsfuehrung", () => {
    expect(istVerwaltung("admin")).toBe(true);
    expect(istVerwaltung("geschaeftsfuehrer")).toBe(true);
  });

  it("gilt fuer niemanden sonst", () => {
    expect(istVerwaltung("besteller")).toBe(false);
    expect(istVerwaltung("buchhaltung")).toBe(false);
    expect(istVerwaltung("")).toBe(false);
    expect(istVerwaltung(null)).toBe(false);
    expect(istVerwaltung(undefined)).toBe(false);
    expect(istVerwaltung("Admin")).toBe(false);
  });
});

describe("istNurAdmin", () => {
  it("laesst die Geschaeftsfuehrung nicht durch", () => {
    // Testdaten und DSGVO-Loeschung haengen hieran.
    expect(istNurAdmin("admin")).toBe(true);
    expect(istNurAdmin("geschaeftsfuehrer")).toBe(false);
    expect(istNurAdmin("besteller")).toBe(false);
    expect(istNurAdmin("buchhaltung")).toBe(false);
    expect(istNurAdmin(null)).toBe(false);
  });
});

describe("darfBestellungenErhalten", () => {
  it("Besteller und Geschaeftsfuehrung ja, Admin und Buchhaltung nein", () => {
    expect(darfBestellungenErhalten("besteller")).toBe(true);
    expect(darfBestellungenErhalten("geschaeftsfuehrer")).toBe(true);
    // Sonst landen Bestellungen beim IT-Support statt bei den Bestellern.
    expect(darfBestellungenErhalten("admin")).toBe(false);
    expect(darfBestellungenErhalten("buchhaltung")).toBe(false);
    expect(darfBestellungenErhalten(null)).toBe(false);
  });
});

describe("ROLLEN", () => {
  it("enthaelt genau die vier bekannten Rollen", () => {
    expect([...ROLLEN].sort()).toEqual(
      ["admin", "besteller", "buchhaltung", "geschaeftsfuehrer"].sort(),
    );
  });

  it("jede Rolle ist entweder Verwaltung oder nicht — nichts dazwischen", () => {
    for (const r of ROLLEN) {
      expect(typeof istVerwaltung(r)).toBe("boolean");
      if (istNurAdmin(r)) expect(istVerwaltung(r)).toBe(true);
    }
  });
});
