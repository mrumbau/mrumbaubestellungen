import { describe, it, expect } from "vitest";
import { postgrestListe } from "../eingang";

describe("postgrestListe", () => {
  it("setzt jeden Wert in Anfuehrungszeichen und trennt mit Komma", () => {
    expect(postgrestListe(["a", "b"])).toBe('"a","b"');
  });
  it("laesst Message-IDs mit Sonderzeichen heil", () => {
    expect(postgrestListe(["<x,y@mail.de>"])).toBe('"<x,y@mail.de>"');
  });
  it("escaped Anfuehrungszeichen und Backslash im Wert", () => {
    expect(postgrestListe(['a"b', "c\\d"])).toBe('"a\\"b","c\\\\d"');
  });
});

describe("KONTROLLE_KEYS", () => {
  it("liegt im Server-sicheren Modul und kennt die vier Zustaende in Anzeigereihenfolge", async () => {
    const { KONTROLLE_KEYS } = await import("../eingang");
    expect([...KONTROLLE_KEYS]).toEqual(["ohne_bestellung", "aussortiert", "fehlgeschlagen", "verbucht"]);
  });
});
