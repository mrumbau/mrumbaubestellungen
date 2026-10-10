import { describe, it, expect } from "vitest";
import { beschreibeZuordnung, zuordnungAus, zuordnungsHinweis } from "../zuordnung-begruendung";

describe("zuordnungsHinweis", () => {
  it("nennt den ersten unsicheren Beleg mit Typ und Grund", () => {
    const text = zuordnungsHinweis([
      { typ: "bestellbestaetigung", zuordnung: { methode: "neu", nummer: "MR015/0027" } },
      { typ: "rechnung", zuordnung: { methode: "bestellnummer_aehnlich", nummer: "117957 MR015/0027" } },
      { typ: "lieferschein", zuordnung: { methode: "querverweis" } },
    ]);
    expect(text).toBe("Rechnung: Nummer 117957 MR015/0027 nur ähnlich, bitte prüfen");
  });

  it("ist null, wenn alle Belege sicher zugeordnet sind oder nichts dazu wissen", () => {
    expect(zuordnungsHinweis([{ typ: "rechnung", zuordnung: { methode: "bestellnummer", nummer: "1" } }])).toBeNull();
    expect(zuordnungsHinweis([{ typ: "rechnung", zuordnung: null }, { typ: "rechnung" }])).toBeNull();
    expect(zuordnungsHinweis([])).toBeNull();
  });

  it("unbekannter Belegtyp heisst Beleg", () => {
    expect(zuordnungsHinweis([{ typ: "sonstiges", zuordnung: { methode: "haendler_offen" } }])).toMatch(/^Beleg: /);
  });
});

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
