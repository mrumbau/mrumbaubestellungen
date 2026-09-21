/**
 * Haendler-Stammdaten in der Feld-Propagation (21.09.2026).
 *
 * Zwei gemessene Probleme, die hier deterministisch geloest werden statt per
 * KI-Erkennung am Belegtext:
 *
 *   1. Von 44 Amazon-Business-Rechnungen wurde KEINE als bereits bezahlt
 *      erkannt, bei Bernstein 4 von 4 — Bernstein schreibt "PayPal" auf die
 *      Rechnung, Amazon nicht.
 *   2. Die meisten Vendor-Parser setzen faelligkeitsdatum hart auf null.
 *
 * Wichtig an den Tests: der Rueckfall ueber den Haendlernamen. Sieben der 27
 * Amazon-Business-Bestellungen hatten gar keine haendler_id — ohne diesen
 * Pfad waeren sie weiter in der Freigabe haengen geblieben.
 */

import { describe, it, expect, vi } from "vitest";
import { propagateAnalyseFields } from "../bestellung-propagate";
import type { DokumentAnalyse } from "@/lib/openai";

type Bestellung = Record<string, unknown>;
type Haendler = { id?: string; name: string; immer_vorausbezahlt: boolean; zahlungsziel_tage: number | null };

/**
 * Mock fuer die drei Zugriffe der Funktion:
 *   bestellungen.select(...).eq(id).maybeSingle()
 *   haendler.select(...).eq("id", ...).maybeSingle()      — Pfad ueber ID
 *   haendler.select(...).eq("immer_vorausbezahlt", true)   — Pfad ueber Namen
 *   bestellungen.update(felder).eq(id)
 */
function makeSupabaseMock(bestellung: Bestellung, haendler: Haendler[]) {
  const updates: Record<string, unknown>[] = [];

  const client = {
    from(tabelle: string) {
      if (tabelle === "bestellungen") {
        const b: Record<string, unknown> = {
          select: () => b,
          update: (felder: Record<string, unknown>) => {
            updates.push(felder);
            return { eq: async () => ({ data: null }) };
          },
          eq: () => b,
          maybeSingle: async () => ({ data: bestellung }),
        };
        return b;
      }
      // haendler
      const h: Record<string, unknown> = {
        select: () => h,
        eq: (spalte: string, wert: unknown) => {
          if (spalte === "id") {
            const treffer = haendler.find((x) => x.id === wert) ?? null;
            return { maybeSingle: async () => ({ data: treffer }) };
          }
          // .eq("immer_vorausbezahlt", true) — thenable, wird direkt awaited
          const liste = haendler.filter((x) => x.immer_vorausbezahlt);
          return {
            then: (res: (v: { data: Haendler[] }) => unknown) => res({ data: liste }),
          };
        },
      };
      return h;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, updates };
}

function analyse(over: Partial<DokumentAnalyse> = {}): DokumentAnalyse {
  return {
    typ: "rechnung", bestellnummer: null, auftragsnummer: null, lieferscheinnummer: null,
    haendler: null, datum: null, artikel: [], gesamtbetrag: null, netto: null, mwst: null,
    faelligkeitsdatum: null, lieferdatum: null, iban: null, konfidenz: 0.9, ...over,
  } as DokumentAnalyse;
}

const LEERE_BESTELLUNG: Bestellung = {
  bestellnummer: null, auftragsnummer: null, lieferscheinnummer: null, betrag: null,
  voraussichtliche_lieferung: null, lieferadresse_erkannt: null, tracking_nummer: null,
  bestelldatum: null, faelligkeitsdatum: null, kundennummer: null, projekt_referenz: null,
  haendler_id: null, haendler_name: null, vorausbezahlt: false,
};

const AMAZON: Haendler = { id: "h-amazon", name: "Amazon", immer_vorausbezahlt: true, zahlungsziel_tage: null };
const RAAB: Haendler = { id: "h-raab", name: "Raab Karcher", immer_vorausbezahlt: false, zahlungsziel_tage: 30 };

describe("propagateAnalyseFields — vorausbezahlt aus Haendler-Stammdaten", () => {
  it("markiert die Bestellung, wenn der Haendler immer vorausbezahlt ist", async () => {
    const { client, updates } = makeSupabaseMock(
      { ...LEERE_BESTELLUNG, haendler_id: "h-amazon", haendler_name: "Amazon Business" },
      [AMAZON],
    );
    await propagateAnalyseFields(client, "b-1", analyse(), { mode: "document" });
    expect(updates[0]?.vorausbezahlt).toBe(true);
  });

  it("greift auch ohne haendler_id ueber den Namen (die sieben Amazon-Faelle)", async () => {
    const { client, updates } = makeSupabaseMock(
      { ...LEERE_BESTELLUNG, haendler_id: null, haendler_name: "Amazon Business" },
      [AMAZON],
    );
    await propagateAnalyseFields(client, "b-2", analyse(), { mode: "document" });
    expect(updates[0]?.vorausbezahlt).toBe(true);
  });

  it("nimmt ueber den Namen keinen fremden Haendler mit", async () => {
    const { client, updates } = makeSupabaseMock(
      { ...LEERE_BESTELLUNG, haendler_id: null, haendler_name: "Bauhaus" },
      [AMAZON],
    );
    await propagateAnalyseFields(client, "b-3", analyse(), { mode: "document" });
    expect(updates[0]?.vorausbezahlt).toBeUndefined();
  });

  it("setzt nichts erneut, wenn schon vorausbezahlt", async () => {
    const { client, updates } = makeSupabaseMock(
      { ...LEERE_BESTELLUNG, haendler_id: "h-amazon", haendler_name: "Amazon", vorausbezahlt: true },
      [AMAZON],
    );
    await propagateAnalyseFields(client, "b-4", analyse(), { mode: "document" });
    expect(updates[0]?.vorausbezahlt).toBeUndefined();
  });
});

describe("propagateAnalyseFields — Faelligkeit aus Zahlungsziel", () => {
  it("berechnet die Faelligkeit aus Rechnungsdatum + Zahlungsziel", async () => {
    const { client, updates } = makeSupabaseMock(
      { ...LEERE_BESTELLUNG, haendler_id: "h-raab", haendler_name: "Raab Karcher" },
      [RAAB],
    );
    await propagateAnalyseFields(client, "b-5", analyse({ datum: "2026-09-01" }), { mode: "document" });
    expect(updates[0]?.faelligkeitsdatum).toBe("2026-10-01");
  });

  it("laesst die Faelligkeit vom Beleg gewinnen", async () => {
    const { client, updates } = makeSupabaseMock(
      { ...LEERE_BESTELLUNG, haendler_id: "h-raab", haendler_name: "Raab Karcher" },
      [RAAB],
    );
    await propagateAnalyseFields(
      client, "b-6",
      analyse({ datum: "2026-09-01", faelligkeitsdatum: "2026-09-10" }),
      { mode: "document" },
    );
    expect(updates[0]?.faelligkeitsdatum).toBe("2026-09-10");
  });

  it("ruehrt eine bereits gespeicherte Faelligkeit nicht an", async () => {
    const { client, updates } = makeSupabaseMock(
      { ...LEERE_BESTELLUNG, haendler_id: "h-raab", haendler_name: "Raab Karcher", faelligkeitsdatum: "2026-08-15" },
      [RAAB],
    );
    await propagateAnalyseFields(client, "b-7", analyse({ datum: "2026-09-01" }), { mode: "document" });
    expect(updates[0]?.faelligkeitsdatum).toBeUndefined();
  });

  it("rechnet nur bei Rechnungen — ein Lieferschein hat keine Zahlfrist", async () => {
    const { client, updates } = makeSupabaseMock(
      { ...LEERE_BESTELLUNG, haendler_id: "h-raab", haendler_name: "Raab Karcher" },
      [RAAB],
    );
    await propagateAnalyseFields(client, "b-8", analyse({ typ: "lieferschein", datum: "2026-09-01" }), { mode: "document" });
    expect(updates[0]?.faelligkeitsdatum).toBeUndefined();
  });

  it("erfindet ohne Basisdatum kein Datum", async () => {
    const { client, updates } = makeSupabaseMock(
      { ...LEERE_BESTELLUNG, haendler_id: "h-raab", haendler_name: "Raab Karcher" },
      [RAAB],
    );
    await propagateAnalyseFields(client, "b-9", analyse({ datum: null }), { mode: "document" });
    expect(updates[0]?.faelligkeitsdatum).toBeUndefined();
  });

  it("bleibt ohne Haendler-Stammsatz wirkungslos", async () => {
    const { client, updates } = makeSupabaseMock(
      { ...LEERE_BESTELLUNG, haendler_id: null, haendler_name: null }, [],
    );
    await propagateAnalyseFields(client, "b-10", analyse({ datum: "2026-09-01" }), { mode: "document" });
    expect(updates[0]?.vorausbezahlt).toBeUndefined();
    expect(updates[0]?.faelligkeitsdatum).toBeUndefined();
  });
});

// Nicht benutzt, aber haelt vi im Import-Graph konsistent mit den anderen Tests.
void vi;
