import { describe, it, expect } from "vitest";
import {
  groupByMonth,
  matchesSearchOrder,
  matchesSearchProjekt,
  inDateRange,
} from "../archiv-utils";
import type { ArchivedProjekt, PaidBestellung } from "@/components/archiv/types";

function makeOrder(overrides: Partial<PaidBestellung> = {}): PaidBestellung {
  return {
    id: "1",
    bestellnummer: "BN-1",
    haendler_name: "Bauhaus",
    besteller_kuerzel: "MT",
    besteller_name: "Marlon Tschon",
    betrag: 100,
    bezahlt_am: "2026-05-01T10:00:00Z",
    bezahlt_von: "NJ",
    bestellungsart: "material",
    projekt_id: null,
    projekt_name: "Projekt X",
    hat_bestellbestaetigung: true,
    hat_lieferschein: true,
    hat_rechnung: true,
    ...overrides,
  };
}

function makeProjekt(overrides: Partial<ArchivedProjekt> = {}): ArchivedProjekt {
  return {
    id: "p1",
    name: "Sanierung Berlin",
    beschreibung: "Komplettsanierung",
    farbe: "#570006",
    budget: 50000,
    status: "abgeschlossen",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("groupByMonth", () => {
  it("gruppiert Bestellungen nach Monat des angegebenen Felds", () => {
    const orders = [
      makeOrder({ id: "a", bezahlt_am: "2026-05-15T12:00:00Z", betrag: 100 }),
      makeOrder({ id: "b", bezahlt_am: "2026-05-20T12:00:00Z", betrag: 200 }),
      makeOrder({ id: "c", bezahlt_am: "2026-04-01T12:00:00Z", betrag: 50 }),
    ];
    const groups = groupByMonth(orders, "bezahlt_am");
    expect(groups).toHaveLength(2);
    // Neuester Monat zuerst
    expect(groups[0].key).toBe("2026-05");
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].subtotal).toBe(300);
    expect(groups[1].key).toBe("2026-04");
    expect(groups[1].subtotal).toBe(50);
  });

  it("formatiert Label deutsch + capitalized", () => {
    const groups = groupByMonth([
      makeOrder({ bezahlt_am: "2026-03-15T00:00:00Z" }),
    ], "bezahlt_am");
    expect(groups[0].label).toMatch(/^März 2026$/);
  });

  it("ignoriert Bestellungen ohne Datum oder mit ungültigem Format", () => {
    const orders = [
      makeOrder({ id: "ok", bezahlt_am: "2026-05-01T00:00:00Z" }),
      makeOrder({ id: "bad", bezahlt_am: "" }),
      makeOrder({ id: "invalid", bezahlt_am: "nicht-datum" }),
    ];
    const groups = groupByMonth(orders, "bezahlt_am");
    const allItems = groups.flatMap((g) => g.items.map((i) => i.id));
    expect(allItems).toContain("ok");
    expect(allItems).not.toContain("bad");
    expect(allItems).not.toContain("invalid");
  });

  it("subtotal addiert numerische Strings korrekt (DB-numeric)", () => {
    const orders = [
      makeOrder({ bezahlt_am: "2026-05-01T00:00:00Z", betrag: 100 }),
      // @ts-expect-error — Test für numeric-string aus DB
      makeOrder({ bezahlt_am: "2026-05-02T00:00:00Z", betrag: "200.50" }),
    ];
    const groups = groupByMonth(orders, "bezahlt_am");
    expect(groups[0].subtotal).toBe(300.5);
  });

  it("liefert leeres Array bei keinen passenden Items", () => {
    expect(groupByMonth([], "bezahlt_am")).toEqual([]);
  });
});

describe("matchesSearchOrder", () => {
  it("matched bei leerer Query alles", () => {
    expect(matchesSearchOrder(makeOrder(), "")).toBe(true);
  });

  it("matched Bestellnummer case-insensitive", () => {
    const o = makeOrder({ bestellnummer: "BN-12345" });
    expect(matchesSearchOrder(o, "bn-12345")).toBe(true);
    expect(matchesSearchOrder(o, "12345")).toBe(true);
    expect(matchesSearchOrder(o, "BN-99")).toBe(false);
  });

  it("matched Händler", () => {
    expect(matchesSearchOrder(makeOrder({ haendler_name: "Raab Karcher" }), "raab")).toBe(true);
  });

  it("matched Besteller", () => {
    expect(matchesSearchOrder(makeOrder({ besteller_name: "Marlon" }), "marlon")).toBe(true);
  });

  it("matched Projekt", () => {
    expect(matchesSearchOrder(makeOrder({ projekt_name: "Sanierung Mitte" }), "mitte")).toBe(true);
  });

  it("matched Subunternehmer-Firma + Gewerk", () => {
    const o = makeOrder({ subunternehmer_firma: "Müller Heizung", subunternehmer_gewerk: "Sanitär" });
    expect(matchesSearchOrder(o, "müller")).toBe(true);
    expect(matchesSearchOrder(o, "sanitär")).toBe(true);
  });

  it("returnt false wenn keine Spalte matcht", () => {
    expect(matchesSearchOrder(makeOrder(), "xyz-not-existing")).toBe(false);
  });
});

describe("matchesSearchProjekt", () => {
  it("matched bei leerer Query alles", () => {
    expect(matchesSearchProjekt(makeProjekt(), "")).toBe(true);
  });

  it("matched Name + Beschreibung case-insensitive", () => {
    const p = makeProjekt({ name: "Sanierung Berlin", beschreibung: "Vollumbau" });
    expect(matchesSearchProjekt(p, "berlin")).toBe(true);
    expect(matchesSearchProjekt(p, "vollumbau")).toBe(true);
    expect(matchesSearchProjekt(p, "BERLIN")).toBe(true);
  });

  it("returnt false bei No-Match", () => {
    expect(matchesSearchProjekt(makeProjekt(), "münchen")).toBe(false);
  });

  it("toleriert null-Beschreibung", () => {
    expect(matchesSearchProjekt(makeProjekt({ beschreibung: null }), "sanierung")).toBe(true);
  });
});

describe("inDateRange", () => {
  it("returnt false bei null-Datum sobald irgendeine Grenze gesetzt", () => {
    expect(inDateRange(null, "2026-01-01", "")).toBe(false);
    expect(inDateRange(null, "", "2026-12-31")).toBe(false);
  });

  it("returnt false bei null-Datum auch ohne Grenzen (defensive)", () => {
    expect(inDateRange(null, "", "")).toBe(false);
  });

  it("matched innerhalb des Bereichs", () => {
    expect(inDateRange("2026-05-15T12:00:00Z", "2026-05-01", "2026-05-31")).toBe(true);
  });

  it("inklusive an beiden Grenzen", () => {
    expect(inDateRange("2026-05-01T00:00:00Z", "2026-05-01", "2026-05-31")).toBe(true);
    expect(inDateRange("2026-05-31T23:59:59Z", "2026-05-01", "2026-05-31")).toBe(true);
  });

  it("verweigert außerhalb", () => {
    expect(inDateRange("2026-04-30T00:00:00Z", "2026-05-01", "2026-05-31")).toBe(false);
    expect(inDateRange("2026-06-01T00:00:00Z", "2026-05-01", "2026-05-31")).toBe(false);
  });

  it("nur Untergrenze", () => {
    expect(inDateRange("2026-05-15T00:00:00Z", "2026-05-01", "")).toBe(true);
    expect(inDateRange("2026-04-30T00:00:00Z", "2026-05-01", "")).toBe(false);
  });

  it("nur Obergrenze", () => {
    expect(inDateRange("2026-05-15T00:00:00Z", "", "2026-05-31")).toBe(true);
    expect(inDateRange("2026-06-01T00:00:00Z", "", "2026-05-31")).toBe(false);
  });
});
