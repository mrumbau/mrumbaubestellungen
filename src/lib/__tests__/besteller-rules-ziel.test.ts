/**
 * Tests fuer die Pruefung des Regelziels.
 *
 * Eine Regel mit unbrauchbarem Ziel ist im Betrieb nicht von einer fehlenden
 * Regel zu unterscheiden — sie greift einfach nie. Deshalb muss die Pruefung
 * hier hart sein und darf nicht durchwinken.
 */
import { describe, it, expect } from "vitest";
import { pruefeZiel } from "../besteller-rules-ziel";

type Zeile = { kuerzel: string; name: string; rolle: string; nimmt_neue_bestellungen: boolean | null };

function mock(zeile: Zeile | null, fehler = false) {
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () =>
      fehler ? { data: null, error: { message: "DB weg" } } : { data: zeile, error: null },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => q } as any;
}

const cr: Zeile = { kuerzel: "CR", name: "Carsten Reuter", rolle: "besteller", nimmt_neue_bestellungen: true };

describe("pruefeZiel", () => {
  it("laesst einen aktiven Besteller durch", async () => {
    expect(await pruefeZiel(mock(cr), "CR")).toBeNull();
  });

  it("laesst die Geschaeftsfuehrung durch", async () => {
    const gf = { ...cr, kuerzel: "CR", rolle: "geschaeftsfuehrer" };
    expect(await pruefeZiel(mock(gf), "CR")).toBeNull();
  });

  it("nimmt ein Admin-Konto NICHT an", async () => {
    // 30.09.2026 — vorher durfte eine Regel auf einen Admin zeigen. Das war
    // falsch: Admin-Konten koennen gar nicht Eigentuemer einer Bestellung
    // sein, die Regel haette also eine Zuweisung erzeugt, die die Zuordnung
    // an anderer Stelle ablehnt.
    const mh = { ...cr, kuerzel: "MH", name: "Mohammed Hawrami", rolle: "admin" };
    expect(await pruefeZiel(mock(mh), "MH")).not.toBeNull();
  });

  it("nimmt ein unbekanntes Kuerzel nicht an", async () => {
    expect(await pruefeZiel(mock(null), "XY")).toContain("XY");
  });

  it("nimmt einen Ausgeschiedenen nicht an", async () => {
    const mt: Zeile = { kuerzel: "MT", name: "Marlon Tschon", rolle: "besteller", nimmt_neue_bestellungen: false };
    expect(await pruefeZiel(mock(mt), "MT")).toContain("Marlon Tschon");
  });

  it("nimmt eine fremde Rolle nicht an", async () => {
    expect(
      await pruefeZiel(mock({ ...cr, kuerzel: "BU", rolle: "buchhaltung" }), "BU"),
    ).toContain("bekommt keine Bestellungen");
  });

  it("lehnt ab, wenn die Pruefung selbst scheitert — kein stilles Durchwinken", async () => {
    expect(await pruefeZiel(mock(cr, true), "CR")).not.toBeNull();
  });

  it("behandelt ein leeres Flag wie aktiv", async () => {
    expect(await pruefeZiel(mock({ ...cr, nimmt_neue_bestellungen: null }), "CR")).toBeNull();
  });
});
