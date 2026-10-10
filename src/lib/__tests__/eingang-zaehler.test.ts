import { describe, it, expect } from "vitest";
import { eingangZaehlerAus } from "../eingang";

describe("eingangZaehlerAus", () => {
  it("verteilt die Zeilen auf die vier Zustaende und summiert offen", () => {
    const r = eingangZaehlerAus([
      { kontrolle: "verbucht", anzahl: 369, offen: 0 },
      { kontrolle: "aussortiert", anzahl: 250, offen: 73 },
      { kontrolle: "ohne_bestellung", anzahl: 70, offen: 61 },
    ]);
    expect(r.counts).toEqual({ ohne_bestellung: 70, aussortiert: 250, fehlgeschlagen: 0, verbucht: 369 });
    expect(r.offen).toBe(134);
  });

  it("leeres oder fehlendes Ergebnis ergibt Nullen", () => {
    const nullen = { ohne_bestellung: 0, aussortiert: 0, fehlgeschlagen: 0, verbucht: 0 };
    expect(eingangZaehlerAus(null)).toEqual({ counts: nullen, offen: 0 });
    expect(eingangZaehlerAus([])).toEqual({ counts: nullen, offen: 0 });
  });

  it("liest Zahlen auch als Text und ignoriert unbekannte Zustaende in den Pillen", () => {
    const r = eingangZaehlerAus([
      { kontrolle: "verbucht", anzahl: "12" as unknown as number, offen: "0" as unknown as number },
      { kontrolle: "zauber", anzahl: 5, offen: 5 },
    ]);
    expect(r.counts.verbucht).toBe(12);
    expect(Object.keys(r.counts)).toHaveLength(4);
    expect(r.offen).toBe(5);
  });
});
