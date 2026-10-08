import { describe, it, expect } from "vitest";
import { beschreibeZuordnung, zuordnungAus } from "../zuordnung-begruendung";

describe("beschreibeZuordnung", () => {
  it("exakte Bestellnummer ist sicher und nennt die Nummer", () => {
    const b = beschreibeZuordnung({ methode: "bestellnummer", nummer: "147203" });
    expect(b.unsicher).toBe(false);
    expect(b.text).toBe("Bestellnummer 147203 stimmt überein");
  });

  it("aehnliche Nummer, Querverweis und Haendler-offen sind unsicher", () => {
    expect(beschreibeZuordnung({ methode: "bestellnummer_aehnlich", nummer: "1472" }).unsicher).toBe(true);
    expect(beschreibeZuordnung({ methode: "querverweis" }).unsicher).toBe(true);
    expect(beschreibeZuordnung({ methode: "haendler_offen" }).text).toContain("bitte prüfen");
  });

  it("manuell und neu sind sicher", () => {
    expect(beschreibeZuordnung({ methode: "manuell" }).unsicher).toBe(false);
    expect(beschreibeZuordnung({ methode: "neu" }).unsicher).toBe(false);
  });
});

describe("zuordnungAus", () => {
  it("liest _zuordnung aus den Rohdaten", () => {
    expect(zuordnungAus({ typ: "rechnung", _zuordnung: { methode: "querverweis", nummer: "A-1" } })).toEqual({
      methode: "querverweis",
      nummer: "A-1",
    });
  });

  it("gibt null bei fehlender oder unbekannter Methode", () => {
    expect(zuordnungAus(null)).toBeNull();
    expect(zuordnungAus({ typ: "rechnung" })).toBeNull();
    expect(zuordnungAus({ _zuordnung: { methode: "zauber" } })).toBeNull();
  });
});
