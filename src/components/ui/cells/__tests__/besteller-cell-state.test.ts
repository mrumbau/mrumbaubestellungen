/**
 * Tests für resolveBestellerState — die State-Resolver-Logik der BestellerCell.
 *
 * Drei-Sprachen-Disziplin (Pool Phase 1 DESIGN.md): die States dürfen visuell
 * nicht verwechselt werden. Hier verifizieren wir die kanonischen 4 States +
 * Konfidenz-Formatierung + Edge-Cases (leere Strings, null, geteilt-vor-Owner).
 *
 * 02.06.2026.
 */

import { describe, it, expect } from "vitest";
import { resolveBestellerState } from "../besteller-cell-state";

describe("resolveBestellerState — 4 States", () => {
  it("Owner: eindeutig zugewiesener Besteller", () => {
    const s = resolveBestellerState({
      besteller_kuerzel: "MT",
      besteller_name: "Marlon Tschon",
      bestellungsart: "material",
    });
    expect(s.kind).toBe("owner");
    expect(s.kuerzel).toBe("MT");
    expect(s.name).toBe("Marlon Tschon");
    expect(s.srPrefix).toBe("Besteller:");
  });

  it("Geteilt: SU/Abo mit UNBEKANNT → kind=geteilt, nicht owner", () => {
    const sub = resolveBestellerState({
      besteller_kuerzel: "UNBEKANNT",
      besteller_name: "UNBEKANNT",
      bestellungsart: "subunternehmer",
    });
    expect(sub.kind).toBe("geteilt");
    expect(sub.kuerzel).toBe("GT");

    const abo = resolveBestellerState({
      besteller_kuerzel: "UNBEKANNT",
      besteller_name: "UNBEKANNT",
      bestellungsart: "abo",
    });
    expect(abo.kind).toBe("geteilt");
  });

  it("Vorschlag: UNBEKANNT-Material mit Pipeline-Hint", () => {
    const s = resolveBestellerState({
      besteller_kuerzel: "UNBEKANNT",
      besteller_name: "UNBEKANNT",
      bestellungsart: "material",
      vorschlag_kuerzel: "MT",
      vorschlag_konfidenz: 0.89,
    });
    expect(s.kind).toBe("vorschlag");
    expect(s.kuerzel).toBe("MT");
    expect(s.title).toContain("89 %");
    expect(s.title).toContain("Noch niemand hat übernommen");
    expect(s.srPrefix).toBe("Vorschlag:");
  });

  it("Vorschlag ohne Konfidenz: Title hat keine %-Angabe", () => {
    const s = resolveBestellerState({
      besteller_kuerzel: "UNBEKANNT",
      besteller_name: "UNBEKANNT",
      bestellungsart: "material",
      vorschlag_kuerzel: "CR",
      vorschlag_konfidenz: null,
    });
    expect(s.kind).toBe("vorschlag");
    expect(s.title).not.toContain("%");
  });

  it("Unzugeordnet: UNBEKANNT-Material ohne Vorschlag → '?'-Glyph", () => {
    const s = resolveBestellerState({
      besteller_kuerzel: "UNBEKANNT",
      besteller_name: "UNBEKANNT",
      bestellungsart: "material",
    });
    expect(s.kind).toBe("unzugeordnet");
    expect(s.kuerzel).toBe("?");
    expect(s.name).toBe("Nicht zugeordnet");
  });

  it("Unzugeordnet: vorschlag_kuerzel='UNBEKANNT' wird nicht als Vorschlag missverstanden", () => {
    const s = resolveBestellerState({
      besteller_kuerzel: "UNBEKANNT",
      besteller_name: "UNBEKANNT",
      bestellungsart: "material",
      vorschlag_kuerzel: "UNBEKANNT",
      vorschlag_konfidenz: 0.4,
    });
    expect(s.kind).toBe("unzugeordnet");
  });
});

describe("resolveBestellerState — Edge-Cases", () => {
  it("null/undefined kuerzel + Material → unzugeordnet (mit ?-Glyph)", () => {
    const s1 = resolveBestellerState({
      besteller_kuerzel: null,
      besteller_name: null,
      bestellungsart: "material",
    });
    expect(s1.kind).toBe("unzugeordnet");

    const s2 = resolveBestellerState({
      besteller_kuerzel: undefined,
      besteller_name: undefined,
      bestellungsart: "material",
    });
    expect(s2.kind).toBe("unzugeordnet");
  });

  it("Leerer kuerzel-String wird als UNBEKANNT behandelt", () => {
    const s = resolveBestellerState({
      besteller_kuerzel: "",
      besteller_name: "",
      bestellungsart: "material",
    });
    expect(s.kind).toBe("unzugeordnet");
  });

  it("Geteilt hat Vorrang vor Vorschlag (SU mit Vorschlag-Hint → geteilt)", () => {
    // 02.06.2026 — Geteilt-Pfad ist semantisch authoritative für SU/Abo,
    // unabhängig davon ob die Pipeline einen Vorschlag mitschickt. Wenn die
    // Bestellungsart SU ist, ist sie ALLEN Bestellern gleichberechtigt.
    const s = resolveBestellerState({
      besteller_kuerzel: "UNBEKANNT",
      besteller_name: "UNBEKANNT",
      bestellungsart: "subunternehmer",
      vorschlag_kuerzel: "MT",
      vorschlag_konfidenz: 0.95,
    });
    expect(s.kind).toBe("geteilt");
    expect(s.kuerzel).toBe("GT");
  });

  it("Konfidenz wird auf ganze Prozent gerundet (0.756 → '76 %')", () => {
    const s = resolveBestellerState({
      besteller_kuerzel: "UNBEKANNT",
      besteller_name: "UNBEKANNT",
      bestellungsart: "material",
      vorschlag_kuerzel: "CR",
      vorschlag_konfidenz: 0.756,
    });
    expect(s.title).toContain("76 %");
  });

  it("Owner ohne bestellungsart (default-Pfad) bleibt owner, kein Crash", () => {
    const s = resolveBestellerState({
      besteller_kuerzel: "MT",
      besteller_name: "Marlon Tschon",
    });
    expect(s.kind).toBe("owner");
  });

  it("Owner mit vorschlag_kuerzel: vorschlag wird ignoriert (Owner gewinnt)", () => {
    const s = resolveBestellerState({
      besteller_kuerzel: "MT",
      besteller_name: "Marlon Tschon",
      bestellungsart: "material",
      vorschlag_kuerzel: "CR",
      vorschlag_konfidenz: 0.5,
    });
    expect(s.kind).toBe("owner");
    expect(s.kuerzel).toBe("MT");
  });
});
