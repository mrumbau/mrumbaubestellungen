import { describe, it, expect } from "vitest";
import {
  gehoertInLauf,
  leseZahltage,
  naechsterZahltag,
  zahltagDanach,
  zahlungslauf,
} from "../zahlungslauf";

const d = (iso: string) => new Date(`${iso}T10:00:00`);

describe("leseZahltage", () => {
  it("liest einen oder mehrere Tage, sortiert und ohne Dubletten", () => {
    expect(leseZahltage("20")).toEqual([20]);
    expect(leseZahltage("20, 10")).toEqual([10, 20]);
    expect(leseZahltage("10;20;10")).toEqual([10, 20]);
  });

  it("Unsinn faellt heraus, leer heisst der 20.", () => {
    expect(leseZahltage("0, 29, abc")).toEqual([20]);
    expect(leseZahltage("")).toEqual([20]);
    expect(leseZahltage(null)).toEqual([20]);
    expect(leseZahltage("31, 15")).toEqual([15]);
  });
});

describe("naechsterZahltag / zahltagDanach", () => {
  it("heute zaehlt noch, danach der naechste Monat", () => {
    expect(naechsterZahltag([20], d("2026-10-12"))).toEqual(new Date(2026, 9, 20));
    expect(naechsterZahltag([20], d("2026-10-20"))).toEqual(new Date(2026, 9, 20));
    expect(naechsterZahltag([20], d("2026-10-21"))).toEqual(new Date(2026, 10, 20));
    expect(naechsterZahltag([20], d("2026-12-21"))).toEqual(new Date(2027, 0, 20));
  });

  it("mit zwei Tagen im Monat", () => {
    expect(naechsterZahltag([10, 20], d("2026-10-12"))).toEqual(new Date(2026, 9, 20));
    expect(naechsterZahltag([10, 20], d("2026-10-25"))).toEqual(new Date(2026, 10, 10));
    expect(zahltagDanach([10, 20], new Date(2026, 9, 20))).toEqual(new Date(2026, 10, 10));
    expect(zahltagDanach([20], new Date(2026, 9, 20))).toEqual(new Date(2026, 10, 20));
  });
});

describe("gehoertInLauf", () => {
  const naechster = new Date(2026, 10, 20); // 20.11.

  it("faellig vor dem naechsten Lauf: ja; danach: nein; ohne Datum: ja", () => {
    expect(gehoertInLauf({ id: "a", betrag: 1, faelligkeitsdatum: "2026-11-19", bezahlt_am: null }, naechster)).toBe(true);
    expect(gehoertInLauf({ id: "b", betrag: 1, faelligkeitsdatum: "2026-11-20", bezahlt_am: null }, naechster)).toBe(false);
    expect(gehoertInLauf({ id: "c", betrag: 1, faelligkeitsdatum: "2026-09-01", bezahlt_am: null }, naechster)).toBe(true);
    expect(gehoertInLauf({ id: "d", betrag: 1, faelligkeitsdatum: null, bezahlt_am: null }, naechster)).toBe(true);
  });

  it("bezahlt, archiviert, Gutschrift und gesperrt bleiben draussen", () => {
    const basis = { id: "x", betrag: 1, faelligkeitsdatum: "2026-10-15", bezahlt_am: null };
    expect(gehoertInLauf({ ...basis, bezahlt_am: "2026-10-01" }, naechster)).toBe(false);
    expect(gehoertInLauf({ ...basis, archiviert_am: "2026-10-01" }, naechster)).toBe(false);
    expect(gehoertInLauf({ ...basis, ist_gutschrift: true }, naechster)).toBe(false);
    expect(gehoertInLauf({ ...basis, gesperrt_am: "2026-10-11T08:00:00Z" }, naechster)).toBe(false);
  });
});

describe("zahlungslauf", () => {
  it("stellt den Lauf am 20.10. zusammen: Summe, ueberfaellig, ohne Faelligkeit, sortiert", () => {
    const heute = d("2026-10-12");
    const r = zahlungslauf(
      [
        { id: "spaet", betrag: 100, faelligkeitsdatum: "2026-11-25", bezahlt_am: null },
        { id: "ohne", betrag: 50, faelligkeitsdatum: null, bezahlt_am: null },
        { id: "ueber", betrag: 200, faelligkeitsdatum: "2026-10-01", bezahlt_am: null },
        { id: "bald", betrag: 300, faelligkeitsdatum: "2026-11-05", bezahlt_am: null },
        { id: "gesperrt", betrag: 999, faelligkeitsdatum: "2026-10-15", bezahlt_am: null, gesperrt_am: "2026-10-11T08:00:00Z" },
        { id: "bezahlt", betrag: 999, faelligkeitsdatum: "2026-10-15", bezahlt_am: "2026-10-10" },
      ],
      [20],
      heute,
    );
    expect(r.lauf).toEqual(new Date(2026, 9, 20));
    expect(r.naechsterLauf).toEqual(new Date(2026, 10, 20));
    expect(r.zeilen.map((z) => z.id)).toEqual(["ueber", "bald", "ohne"]);
    expect(r.summe).toBe(550);
    expect(r.ueberfaellig).toBe(1);
    expect(r.ohneFaelligkeit).toBe(1);
  });
});
