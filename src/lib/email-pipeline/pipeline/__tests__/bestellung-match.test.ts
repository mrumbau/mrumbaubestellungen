/**
 * bestellung-match Pure-Function Tests.
 *
 * Sicherheitskritisch: bestellnummernFuzzyMatch war R5c-Bug-Trigger
 * (CBEPFVF ⊂ CP-CBEPFVF-128671457-1 wurde nicht erkannt → Doppel-Bestellungen).
 * haendlerNamesMatch ist Foundation für Cross-Match (Bestellnummer kommt aus
 * verschiedenen Schreibweisen wie "CHECK24" vs "CHECK24 Vergleichsportal Autoteile GmbH").
 *
 * findByExactNumber/findByFuzzyNumber/findByCrossMatch brauchen Supabase-Mock —
 * separat in Mock-Infrastruktur-Sprint.
 */

import { describe, it, expect } from "vitest";
import {
  bestellnummernFuzzyMatch,
  haendlerNamesMatch,
  findByExactNumber,
} from "../bestellung-match";

describe("bestellnummernFuzzyMatch — R5c-Bugfix Substring-Match", () => {
  it("exakter Match", () => {
    expect(bestellnummernFuzzyMatch("CBEPFVF", "CBEPFVF")).toBe(true);
    expect(bestellnummernFuzzyMatch("305-1234567-1234567", "305-1234567-1234567")).toBe(true);
  });

  it("CHECK24-Bug: kurze Nr ⊂ lange Nr (Original-Pattern)", () => {
    // Genau das R5c-Bug-Szenario aus Sprint-Memory
    expect(bestellnummernFuzzyMatch("CBEPFVF", "CP-CBEPFVF-128671457-1")).toBe(true);
    expect(bestellnummernFuzzyMatch("CP-CBEPFVF-128671457-1", "CBEPFVF")).toBe(true); // umgekehrt
  });

  it("AUF-Nummer mit Prefix ⊂ vollständige Form", () => {
    expect(bestellnummernFuzzyMatch("AUF1234567", "Auftrag-AUF1234567-Position-1")).toBe(true);
  });

  it("Mindest-Länge 4 — kürzere Nummern werden nicht fuzzy gematched", () => {
    expect(bestellnummernFuzzyMatch("123", "123456")).toBe(false);
    expect(bestellnummernFuzzyMatch("ABC", "ABCDEF")).toBe(false);
  });

  it("liefert false bei null/undefined/leer", () => {
    expect(bestellnummernFuzzyMatch(null, "123456")).toBe(false);
    expect(bestellnummernFuzzyMatch("123456", null)).toBe(false);
    expect(bestellnummernFuzzyMatch(null, null)).toBe(false);
    expect(bestellnummernFuzzyMatch("", "123456")).toBe(false);
    expect(bestellnummernFuzzyMatch("123456", undefined)).toBe(false);
  });

  it("liefert false bei komplett unterschiedlichen Nummern", () => {
    expect(bestellnummernFuzzyMatch("ABC123456", "XYZ987654")).toBe(false);
    expect(bestellnummernFuzzyMatch("AUF1234567", "RE-9876543")).toBe(false);
  });

  it("trimt Whitespace", () => {
    expect(bestellnummernFuzzyMatch("  CBEPFVF  ", "CP-CBEPFVF-1")).toBe(true);
  });
});

describe("haendlerNamesMatch — Cross-Match-Logic", () => {
  it("identischer Name", () => {
    expect(haendlerNamesMatch("CHECK24", "CHECK24")).toBe(true);
    expect(haendlerNamesMatch("Brillux GmbH", "Brillux GmbH")).toBe(true);
  });

  it("case-insensitive", () => {
    expect(haendlerNamesMatch("CHECK24", "check24")).toBe(true);
    expect(haendlerNamesMatch("brillux", "Brillux")).toBe(true);
  });

  it("Substring-Match (kurzer Name in langem)", () => {
    expect(haendlerNamesMatch("CHECK24", "CHECK24 Vergleichsportal Autoteile GmbH")).toBe(true);
    expect(haendlerNamesMatch("CHECK24 Vergleichsportal Autoteile GmbH", "CHECK24")).toBe(true);
    expect(haendlerNamesMatch("Rexel", "Rexel Germany GmbH & Co. KG")).toBe(true);
  });

  it("Token-Match: gemeinsames signifikantes Wort", () => {
    expect(haendlerNamesMatch("Süd-Metall GmbH", "Süd-Metall Verkauf")).toBe(true);
    expect(haendlerNamesMatch("Hold & Spada Bau", "Spada Bauleistungen")).toBe(true);
  });

  it("Stop-Words führen NICHT zu false-positive", () => {
    // "GmbH", "Vergleichsportal", "Service" sind Stop-Words → nicht alleine matchend
    expect(haendlerNamesMatch("Foo GmbH", "Bar GmbH")).toBe(false);
    expect(haendlerNamesMatch("Foo Service", "Bar Service")).toBe(false);
  });

  it("Wörter <4 chars führen NICHT zu false-positive", () => {
    expect(haendlerNamesMatch("Mr Test", "Mr Foo")).toBe(false); // "Mr" + "Mr" sind <4
    expect(haendlerNamesMatch("XY GmbH", "XY OHG")).toBe(false);
  });

  it("liefert false bei null/undefined/leer", () => {
    expect(haendlerNamesMatch(null, "CHECK24")).toBe(false);
    expect(haendlerNamesMatch("CHECK24", null)).toBe(false);
    expect(haendlerNamesMatch(null, null)).toBe(false);
    expect(haendlerNamesMatch("", "CHECK24")).toBe(false);
  });

  it("Substring-Match nur bei Mindest-Länge 4", () => {
    // "ABC" als Substring in "ABCDEF" matched NICHT (zu kurz für sicheren Match)
    expect(haendlerNamesMatch("ABC", "ABCDEFGH")).toBe(false);
  });

  it("Reine Zahlen-Token werden ignoriert", () => {
    // "1234" allein ist kein gültiges Token (reine Zahl filter)
    expect(haendlerNamesMatch("Lieferant 1234", "Anderer 1234")).toBe(false);
  });

  it("Sonderzeichen werden in Token normalisiert", () => {
    // & und Bindestriche werden zu Leerzeichen
    expect(haendlerNamesMatch("Hold & Spada", "Hold-Spada")).toBe(true); // beide haben Token "hold" + "spada"
  });
});

// =====================================================================
// findByExactNumber — Prioritätsreihenfolge
// =====================================================================

/**
 * 21.09.2026 — Die Kandidaten-Queries laufen seit dem Performance-Umbau
 * parallel statt sequenziell. Vorher garantierte das `await` + `return` die
 * Prioritätsreihenfolge implizit; jetzt muss sie explizit beim Einsammeln
 * der Ergebnisse hergestellt werden. Diese Tests pinnen genau das fest —
 * ohne sie könnte ein späterer Umbau unbemerkt die falsche Bestellung
 * zurückgeben, und Fehlzuordnungen sind hier das teuerste Fehlverhalten.
 */

type MockTreffer = {
  spalte: string;
  wert: string;
  ankerSpalte: string;
  ankerWert: string;
  id: string;
};

function makeSupabaseMock(treffer: MockTreffer[]) {
  const calls: Array<Record<string, string>> = [];
  const client = {
    from() {
      return {
        select() {
          const eqs: Record<string, string> = {};
          const builder = {
            eq(spalte: string, wert: string) {
              eqs[spalte] = wert;
              return builder;
            },
            limit() {
              return builder;
            },
            async maybeSingle() {
              calls.push({ ...eqs });
              const hit = treffer.find(
                (t) => eqs[t.spalte] === t.wert && eqs[t.ankerSpalte] === t.ankerWert,
              );
              return { data: hit ? { id: hit.id } : null };
            },
          };
          return builder;
        },
      };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, calls };
}

describe("findByExactNumber — Prioritätsreihenfolge bleibt trotz Parallelität erhalten", () => {
  const ctx = {
    haendler: { id: "h-1", name: "Bauhaus" },
    subunternehmer: null,
    haendlerName: "Bauhaus GmbH",
  };

  it("haendler_id schlägt haendler_name bei gleichzeitigem Treffer", async () => {
    const { client } = makeSupabaseMock([
      { spalte: "bestellnummer", wert: "A1000", ankerSpalte: "haendler_id", ankerWert: "h-1", id: "via-id" },
      { spalte: "bestellnummer", wert: "A1000", ankerSpalte: "haendler_name", ankerWert: "Bauhaus GmbH", id: "via-name" },
    ]);
    const res = await findByExactNumber(client, ["A1000"], ctx);
    expect(res?.id).toBe("via-id");
  });

  it("bestellnummer schlägt auftragsnummer und lieferscheinnummer", async () => {
    const { client } = makeSupabaseMock([
      { spalte: "lieferscheinnummer", wert: "A1000", ankerSpalte: "haendler_id", ankerWert: "h-1", id: "via-ls" },
      { spalte: "auftragsnummer", wert: "A1000", ankerSpalte: "haendler_id", ankerWert: "h-1", id: "via-auf" },
      { spalte: "bestellnummer", wert: "A1000", ankerSpalte: "haendler_id", ankerWert: "h-1", id: "via-best" },
    ]);
    const res = await findByExactNumber(client, ["A1000"], ctx);
    expect(res?.id).toBe("via-best");
  });

  it("erste Suchnummer gewinnt vor späteren", async () => {
    const { client } = makeSupabaseMock([
      { spalte: "bestellnummer", wert: "ERSTE", ankerSpalte: "haendler_id", ankerWert: "h-1", id: "treffer-erste" },
      { spalte: "bestellnummer", wert: "ZWEITE", ankerSpalte: "haendler_id", ankerWert: "h-1", id: "treffer-zweite" },
    ]);
    const res = await findByExactNumber(client, ["ERSTE", "ZWEITE"], ctx);
    expect(res?.id).toBe("treffer-erste");
  });

  it("bricht nach Treffer der ersten Suchnummer ab — zweite wird nicht mehr abgefragt", async () => {
    const { client, calls } = makeSupabaseMock([
      { spalte: "bestellnummer", wert: "ERSTE", ankerSpalte: "haendler_id", ankerWert: "h-1", id: "treffer-erste" },
    ]);
    await findByExactNumber(client, ["ERSTE", "ZWEITE"], ctx);
    expect(calls.some((c) => Object.values(c).includes("ZWEITE"))).toBe(false);
  });

  it("findet über subunternehmer_id wenn kein Händler-Anker greift", async () => {
    const { client } = makeSupabaseMock([
      { spalte: "bestellnummer", wert: "SU-9", ankerSpalte: "subunternehmer_id", ankerWert: "su-1", id: "via-su" },
    ]);
    const res = await findByExactNumber(
      client,
      ["SU-9"],
      { haendler: null, subunternehmer: { id: "su-1", firma: "Elektro Meier" }, haendlerName: null },
    );
    expect(res?.id).toBe("via-su");
  });

  it("liefert null und fragt gar nicht ab, wenn kein Anker vorhanden ist", async () => {
    const { client, calls } = makeSupabaseMock([]);
    const res = await findByExactNumber(
      client,
      ["A1000"],
      { haendler: null, subunternehmer: null, haendlerName: null },
    );
    expect(res).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("liefert null wenn keine Kombination trifft", async () => {
    const { client } = makeSupabaseMock([]);
    const res = await findByExactNumber(client, ["A1000", "B2000"], ctx);
    expect(res).toBeNull();
  });
});
