import { describe, it, expect } from "vitest";
import {
  innerhalbToleranz,
  istBetragsfeld,
  leseToleranz,
  parseBetrag,
  TOLERANZ_DEFAULT,
  toleranzText,
  wendeToleranzAn,
} from "../toleranz";

describe("parseBetrag", () => {
  it("liest deutsche und englische Schreibweisen", () => {
    expect(parseBetrag("1.012,00 €")).toBe(1012);
    expect(parseBetrag("€ 1,012.00")).toBe(1012);
    expect(parseBetrag("1012.00")).toBe(1012);
    expect(parseBetrag("1012,5")).toBe(1012.5);
    expect(parseBetrag("12.50")).toBe(12.5);
    expect(parseBetrag("12,50 EUR")).toBe(12.5);
    expect(parseBetrag("1.012")).toBe(1012);
    expect(parseBetrag("1.234.567,89")).toBe(1234567.89);
    expect(parseBetrag("-5,00")).toBe(-5);
    expect(parseBetrag(42)).toBe(42);
  });

  it("gibt null, wenn keine Zahl drinsteht", () => {
    expect(parseBetrag("")).toBeNull();
    expect(parseBetrag(null)).toBeNull();
    expect(parseBetrag("nicht vorhanden")).toBeNull();
    expect(parseBetrag(Number.NaN)).toBeNull();
  });
});

describe("innerhalbToleranz", () => {
  const t = { prozent: 2, betrag: 5 };

  it("Prozent ODER Betrag reicht", () => {
    expect(innerhalbToleranz(1000, 1012, t)).toBe(true); // 1,2 %
    expect(innerhalbToleranz(1000, 1020, t)).toBe(true); // genau 2 %
    expect(innerhalbToleranz(1000, 1021, t)).toBe(false); // 2,1 % und 21 €
    expect(innerhalbToleranz(50, 54, t)).toBe(true); // 8 %, aber 4 €
    expect(innerhalbToleranz(50, 56, t)).toBe(false); // 12 % und 6 €
    expect(innerhalbToleranz(100, 100, t)).toBe(true);
    expect(innerhalbToleranz(0, 0, t)).toBe(true);
  });

  it("Toleranz null heisst: nur exakt gleich", () => {
    expect(innerhalbToleranz(100, 100.01, { prozent: 0, betrag: 0 })).toBe(false);
    expect(innerhalbToleranz(100, 100, { prozent: 0, betrag: 0 })).toBe(true);
  });
});

describe("leseToleranz", () => {
  it("nimmt Einstellungen aus Map, Objekt oder Zeilen, sonst den Standard", () => {
    expect(leseToleranz(null)).toEqual(TOLERANZ_DEFAULT);
    expect(leseToleranz(new Map([["toleranz_prozent", "3"], ["toleranz_betrag", "10,50"]]))).toEqual({ prozent: 3, betrag: 10.5 });
    expect(leseToleranz({ toleranz_prozent: "1.5" })).toEqual({ prozent: 1.5, betrag: 5 });
    expect(leseToleranz([{ schluessel: "toleranz_betrag", wert: "0" }])).toEqual({ prozent: 2, betrag: 0 });
  });

  it("verwirft Unsinn und zu grosse Werte", () => {
    expect(leseToleranz({ toleranz_prozent: "abc", toleranz_betrag: "-3" })).toEqual(TOLERANZ_DEFAULT);
    expect(leseToleranz({ toleranz_prozent: "80", toleranz_betrag: "5000" })).toEqual(TOLERANZ_DEFAULT);
  });
});

describe("istBetragsfeld", () => {
  it("Geld ja, Mengen und Nummern nein", () => {
    expect(istBetragsfeld("gesamtbetrag")).toBe(true);
    expect(istBetragsfeld("Gesamtbetrag brutto")).toBe(true);
    expect(istBetragsfeld("einzelpreis")).toBe(true);
    expect(istBetragsfeld("netto")).toBe(true);
    expect(istBetragsfeld("Menge")).toBe(false);
    expect(istBetragsfeld("Stückzahl")).toBe(false);
    expect(istBetragsfeld("Lieferdatum")).toBe(false);
    expect(istBetragsfeld("Rechnungsnummer")).toBe(false);
    expect(istBetragsfeld("Artikel")).toBe(false);
    expect(istBetragsfeld("")).toBe(false);
  });
});

describe("wendeToleranzAn", () => {
  const t = { prozent: 2, betrag: 5 };
  const basis = {
    status: "abweichung" as const,
    zusammenfassung: "LS und RG verglichen.",
  };

  it("Betrag innerhalb der Toleranz: Abgleich wird ok, Hinweis in der Zusammenfassung", () => {
    const r = wendeToleranzAn(
      {
        ...basis,
        abweichungen: [
          { feld: "gesamtbetrag", artikel: undefined, erwartet: "1.000,00", gefunden: "1.004,50", dokument: "Rechnung", schwere: "niedrig" },
        ],
      },
      t,
    );
    expect(r.status).toBe("ok");
    expect(r.abweichungen).toEqual([]);
    expect(r.zusammenfassung).toContain("LS und RG verglichen.");
    expect(r.zusammenfassung).toContain("Innerhalb der Toleranz (2 % oder 5,00 €)");
    expect(r.zusammenfassung).toContain("gesamtbetrag 1.000,00 → 1.004,50");
  });

  it("echte Abweichung bleibt, Menge bleibt immer, tolerierte faellt weg", () => {
    const r = wendeToleranzAn(
      {
        ...basis,
        abweichungen: [
          { feld: "gesamtbetrag", erwartet: "1000", gefunden: "1100", dokument: "Rechnung", schwere: "hoch" },
          { feld: "menge", artikel: "Fliesen 30x60", erwartet: "10", gefunden: "10,1", dokument: "Lieferschein", schwere: "mittel" },
          { feld: "einzelpreis", artikel: "Kleber", erwartet: "12,50", gefunden: "12,60", dokument: "Rechnung", schwere: "niedrig" },
        ],
      },
      t,
    );
    expect(r.status).toBe("abweichung");
    expect(r.abweichungen.map((a) => a.feld)).toEqual(["gesamtbetrag", "menge"]);
    expect(r.zusammenfassung).toContain("einzelpreis (Kleber) 12,50 → 12,60");
  });

  it("laesst ok-Ergebnisse und nicht-numerische Felder in Ruhe", () => {
    const ok = { status: "ok" as const, abweichungen: [], zusammenfassung: "Alles gut." };
    expect(wendeToleranzAn(ok, t)).toBe(ok);
    const text = {
      ...basis,
      abweichungen: [{ feld: "betrag", erwartet: "fehlt", gefunden: "12,00", dokument: "Rechnung", schwere: "mittel" as const }],
    };
    expect(wendeToleranzAn(text, t)).toBe(text);
  });

  it("toleranzText formatiert deutsch", () => {
    expect(toleranzText({ prozent: 2.5, betrag: 10 })).toBe("2,5 % oder 10,00 €");
  });
});
