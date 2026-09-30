/**
 * Tests fuer requireRoles — die Weiche, an der seit dem 30.09.2026 rund
 * hundert Pruefstellen haengen.
 *
 * Die Aenderung war: wer "admin" verlangt, meint "darf verwalten", also faellt
 * die Geschaeftsfuehrung mit hinein. Das ist bequem und genau deshalb
 * gefaehrlich — es darf nicht versehentlich auch fuer Besteller oder
 * Buchhaltung gelten, und es darf die strengen Stellen nicht aufweichen.
 */
import { describe, it, expect } from "vitest";
import { requireRoles } from "../auth";
import { istNurAdmin } from "../rollen";

const als = (rolle: string) => ({ rolle });

describe("requireRoles", () => {
  it("laesst die Geschaeftsfuehrung ueberall dort durch, wo Admin verlangt wird", () => {
    expect(requireRoles(als("geschaeftsfuehrer"), "admin")).toBe(true);
    expect(requireRoles(als("geschaeftsfuehrer"), "admin", "besteller")).toBe(true);
  });

  it("laesst Admin und die ausdruecklich genannte Rolle weiter durch", () => {
    expect(requireRoles(als("admin"), "admin")).toBe(true);
    expect(requireRoles(als("besteller"), "admin", "besteller")).toBe(true);
    expect(requireRoles(als("buchhaltung"), "buchhaltung")).toBe(true);
  });

  it("oeffnet nichts fuer Besteller oder Buchhaltung, wo nur Admin verlangt ist", () => {
    expect(requireRoles(als("besteller"), "admin")).toBe(false);
    expect(requireRoles(als("buchhaltung"), "admin")).toBe(false);
  });

  it("macht die Geschaeftsfuehrung nicht zur Buchhaltung", () => {
    // Die Erweiterung haengt an "admin" — sie darf nicht auf jede
    // beliebige verlangte Rolle durchschlagen.
    expect(requireRoles(als("geschaeftsfuehrer"), "buchhaltung")).toBe(false);
    expect(requireRoles(als("geschaeftsfuehrer"), "besteller")).toBe(false);
  });

  it("weist ohne Profil ab", () => {
    expect(requireRoles(null, "admin")).toBe(false);
    expect(requireRoles(null)).toBe(false);
  });

  it("weist bei leerer Rollenliste ab — kein versehentliches Scheunentor", () => {
    expect(requireRoles(als("admin"))).toBe(false);
  });

  it("istNurAdmin bleibt von der Erweiterung unberuehrt", () => {
    // Testdaten und DSGVO-Loeschung haengen hieran und muessen streng bleiben.
    expect(istNurAdmin("geschaeftsfuehrer")).toBe(false);
    expect(istNurAdmin("admin")).toBe(true);
  });
});
