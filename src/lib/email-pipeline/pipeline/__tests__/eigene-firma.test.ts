import { describe, it, expect } from "vitest";
import { istEigeneFirma, ohneEigeneBelege } from "../eigene-firma";

describe("istEigeneFirma", () => {
  it("erkennt die eigene Firma in den ueblichen Schreibweisen", () => {
    expect(istEigeneFirma("MR Umbau")).toBe(true);
    expect(istEigeneFirma("MR Umbau GmbH")).toBe(true);
    expect(istEigeneFirma("mr-umbau gmbh")).toBe(true);
    expect(istEigeneFirma("M.R. Umbau GmbH")).toBe(false);
    expect(istEigeneFirma("Reuter MR GmbH")).toBe(true);
  });

  it("laesst Lieferanten durch, auch mit 'Umbau' im Namen", () => {
    expect(istEigeneFirma("Raab Karcher - Stark Deutschland GmbH")).toBe(false);
    expect(istEigeneFirma("Umbau-Profis Mueller")).toBe(false);
    expect(istEigeneFirma("Dr. Umbauer Elektro")).toBe(false);
    expect(istEigeneFirma(null)).toBe(false);
    expect(istEigeneFirma("")).toBe(false);
  });
});

describe("ohneEigeneBelege", () => {
  it("trennt eigene von fremden Belegen", () => {
    const r = ohneEigeneBelege([
      { analyse: { haendler: "MR Umbau" } },
      { analyse: { haendler: "Elektro-Service Feistbaur" } },
      { analyse: { haendler: null } },
    ]);
    expect(r.eigene).toHaveLength(1);
    expect(r.fremde).toHaveLength(2);
  });
});
