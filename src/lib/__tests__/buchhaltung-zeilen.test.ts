import { describe, it, expect } from "vitest";
import { buchhaltungZeilen, type RechnungMitBestellung } from "../buchhaltung-zeilen";

function rechnung(over: Partial<RechnungMitBestellung> = {}): RechnungMitBestellung {
  return {
    id: "r1",
    bestellung_id: "b1",
    gesamtbetrag: 119,
    faelligkeitsdatum: "2026-10-20",
    bezahlt_am: null,
    bezahlt_von: null,
    archiviert_am: null,
    bestellnummer_erkannt: "RE-77",
    storage_pfad: "rechnungen/r1.pdf",
    bezahlt_bereits: null,
    zahlungsmethode: null,
    bestellungen: {
      bestellnummer: "147203",
      auftragsnummer: null,
      lieferscheinnummer: null,
      haendler_name: "Raab Karcher",
      betrag: 500,
      waehrung: null,
      bestellungsart: null,
      hat_bestellbestaetigung: true,
      hat_lieferschein: null,
      mahnung_am: null,
      mahnung_count: null,
      bestelldatum: "2026-09-01",
      faelligkeitsdatum: "2026-10-01",
      kundennummer: "K1",
      projekt_referenz: null,
      ist_gutschrift: null,
      freigaben: [{ freigegeben_von_name: "Carsten", freigegeben_am: "2026-10-02T10:00:00Z" }],
    },
    ...over,
  };
}

describe("buchhaltungZeilen", () => {
  it("baut eine Zeile je Rechnung mit Rechnungswerten vor Bestellwerten", () => {
    const [z] = buchhaltungZeilen([rechnung()]);
    expect(z.id).toBe("r1");
    expect(z.bestellnummer).toBe("RE-77");
    expect(z.betrag).toBe(119);
    expect(z.faelligkeitsdatum).toBe("2026-10-20");
    expect(z.waehrung).toBe("EUR");
    expect(z.freigegeben_von).toBe("Carsten");
    expect(z.rechnung_id).toBe("r1");
    expect(z.bestellungsart).toBe("material");
    expect(z.hat_lieferschein).toBe(false);
    expect(z.mahnung_count).toBe(0);
    expect(z.ist_gutschrift).toBe(false);
  });

  it("faellt auf die Bestellung zurueck, wenn die Rechnung nichts hat", () => {
    const [z] = buchhaltungZeilen([
      rechnung({ gesamtbetrag: null, faelligkeitsdatum: null, bestellnummer_erkannt: null, storage_pfad: null }),
    ]);
    expect(z.betrag).toBe(500);
    expect(z.faelligkeitsdatum).toBe("2026-10-01");
    expect(z.bestellnummer).toBe("147203");
    expect(z.rechnung_id).toBeNull();
  });

  it("ohne Freigabe steht ein Strich; die neueste Freigabe gewinnt", () => {
    const [ohne] = buchhaltungZeilen([rechnung({ bestellungen: { ...rechnung().bestellungen!, freigaben: null } })]);
    expect(ohne.freigegeben_von).toBe("–");
    expect(ohne.freigegeben_am).toBeNull();

    const [zwei] = buchhaltungZeilen([
      rechnung({
        bestellungen: {
          ...rechnung().bestellungen!,
          freigaben: [
            { freigegeben_von_name: "Alt", freigegeben_am: "2026-09-01T00:00:00Z" },
            { freigegeben_von_name: "Neu", freigegeben_am: "2026-10-01T00:00:00Z" },
          ],
        },
      }),
    ]);
    expect(zwei.freigegeben_von).toBe("Neu");
  });

  it("laesst Belege ohne Bestellung aus und sortiert nach Freigabe absteigend", () => {
    const zeilen = buchhaltungZeilen([
      rechnung({ id: "alt", bestellungen: { ...rechnung().bestellungen!, freigaben: [{ freigegeben_von_name: "A", freigegeben_am: "2026-01-01T00:00:00Z" }] } }),
      rechnung({ id: "verwaist", bestellungen: null }),
      rechnung({ id: "ohne-id", bestellung_id: null }),
      rechnung({ id: "neu" }),
    ]);
    expect(zeilen.map((z) => z.id)).toEqual(["neu", "alt"]);
  });
});
