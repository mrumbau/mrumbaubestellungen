import { describe, it, expect } from "vitest";
import { bewerteSeite, fasseZusammen, SELBSTTEST_SEITEN } from "../selbsttest";

const gut = "<html><body><h1>Eingang</h1></body></html>";

describe("bewerteSeite", () => {
  it("200 mit Ueberschrift ist in Ordnung", () => {
    const e = bewerteSeite({ pfad: "/eingang", status: 200, html: gut, dauerMs: 300 });
    expect(e.ok).toBe(true);
    expect(e.grund).toBeUndefined();
  });

  it("erkennt die Next.js-Fehlerseite trotz HTTP 200", () => {
    const html = "<h1>x</h1>Application error: a server-side exception has occurred";
    expect(bewerteSeite({ pfad: "/eingang", status: 200, html, dauerMs: 1 }).grund).toBe("Next.js-Fehlerseite");
  });

  it("Umleitung nach /login heisst: Anmeldung des Pruefkontos kaputt", () => {
    const e = bewerteSeite({ pfad: "/dashboard", status: 307, html: "", dauerMs: 1, location: "/login" });
    expect(e.ok).toBe(false);
    expect(e.grund).toBe("Umleitung nach /login");
  });

  it("500 ist ein Fehler, fehlende Ueberschrift auch", () => {
    expect(bewerteSeite({ pfad: "/a", status: 500, html: gut, dauerMs: 1 }).grund).toBe("HTTP 500");
    expect(bewerteSeite({ pfad: "/a", status: 200, html: "<p>leer</p>", dauerMs: 1 }).grund).toBe("keine Ueberschrift im HTML");
  });
});

describe("fasseZusammen", () => {
  it("zaehlt Fehler und listet jede Seite", () => {
    const z = fasseZusammen([
      { pfad: "/a", ok: true, status: 200, dauerMs: 400 },
      { pfad: "/b", ok: false, status: 500, dauerMs: 100, grund: "HTTP 500" },
    ]);
    expect(z.ok).toBe(false);
    expect(z.text.split("\n")[0]).toBe("1 von 2 Seiten fehlerhaft");
    expect(z.text).toContain("FEHLER  /b: HTTP 500");
    expect(z.text).toContain("OK      /a (400 ms)");
  });

  it("alles gut: Kopfzeile mit Gesamtdauer", () => {
    const z = fasseZusammen([{ pfad: "/a", ok: true, status: 200, dauerMs: 1500 }]);
    expect(z.ok).toBe(true);
    expect(z.text.split("\n")[0]).toBe("1 Seiten in Ordnung (1.5 s)");
  });
});

describe("SELBSTTEST_SEITEN", () => {
  it("enthaelt den Eingang, der am 05.10. unbemerkt kaputt war", () => {
    expect(SELBSTTEST_SEITEN).toContain("/eingang");
  });
});
