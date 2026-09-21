/**
 * assignBesteller — Filter fuer ausgeschiedene Besteller (21.09.2026).
 *
 * Hintergrund: Marlon (MT) geht ins Studium, neue Bestellungen sollen an
 * Carsten (CR) gehen. Seine 213 Altbestellungen bleiben aber in der Datenbank
 * stehen — und genau daraus speisen sich Stufe 3 (Haendler-Affinitaet) und
 * Stufe 4.5 (KI-Historie). Ohne den Filter auf
 * benutzer_rollen.nimmt_neue_bestellungen wuerde die Historie jede neue
 * Bestellung weiter an MT haengen.
 *
 * Diese Tests pinnen fest, dass der Filter greift — und dass er fail-open
 * bleibt, damit ein DB-Problem die Pipeline nicht anhaelt.
 */

import { describe, it, expect, vi } from "vitest";
import { assignBesteller } from "../besteller-zuordnung";

vi.mock("@/lib/openai", () => ({
  erkenneBestellerIntelligent: vi.fn(async () => ({
    kuerzel: "UNBEKANNT",
    konfidenz: 0,
    begruendung: "Test-Stub",
  })),
}));

type HistorieZeile = { besteller_kuerzel: string; besteller_name: string | null; haendler_name: string | null };

function makeSupabaseMock(opts: {
  historie: HistorieZeile[];
  inaktiv: string[];
  benutzer?: Array<{ kuerzel: string; name: string; email: string }>;
  inaktivWirftFehler?: boolean;
}) {
  const benutzer = opts.benutzer ?? [
    { kuerzel: "MT", name: "Marlon Tschon", email: "mt@mrumbau.de" },
    { kuerzel: "CR", name: "Carsten Reuter", email: "cr@reuter-mr.de" },
  ];

  const client = {
    rpc: async () => ({ data: [] }),            // Rules-Engine: keine Regeln
    from(tabelle: string) {
      if (tabelle === "bestellungen") {
        const b: Record<string, unknown> = {
          select: () => b, ilike: () => b, neq: () => b, order: () => b,
          limit: async () => ({ data: opts.historie }),
        };
        return b;
      }
      // benutzer_rollen — zwei verschiedene Abfragen am selben Tisch
      const q: Record<string, unknown> = {
        select: () => q,
        // Inaktiven-Abfrage endet auf .eq("nimmt_neue_bestellungen", false)
        eq: async () => {
          if (opts.inaktivWirftFehler) throw new Error("DB weg");
          return { data: opts.inaktiv.map((k) => ({ kuerzel: k })) };
        },
        // Kandidaten-Abfrage: .in(...).neq(...)
        in: () => ({
          neq: async () => ({
            data: benutzer.filter((x) => !opts.inaktiv.includes(x.kuerzel)),
          }),
        }),
      };
      return q;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client as any;
}

const ctx = {
  haendlerDomain: "bauhaus.de",
  haendlerName: "Bauhaus",
  absenderDomain: "bauhaus.de",
  vorfilterBestellnummer: null,
  analyseErgebnisse: [],
  emailText: "",
  email_betreff: "",
  email_datum: "2026-09-21T08:00:00Z",
};

const mt = (n: number): HistorieZeile[] =>
  Array.from({ length: n }, () => ({ besteller_kuerzel: "MT", besteller_name: "Marlon Tschon", haendler_name: "Bauhaus" }));
const cr = (n: number): HistorieZeile[] =>
  Array.from({ length: n }, () => ({ besteller_kuerzel: "CR", besteller_name: "Carsten Reuter", haendler_name: "Bauhaus" }));

describe("assignBesteller — ausgeschiedene Besteller bekommen nichts Neues", () => {
  it("ordnet ohne Filter der Mehrheit aus der Historie zu (Verhalten vorher)", async () => {
    const supabase = makeSupabaseMock({ historie: [...mt(9), ...cr(1)], inaktiv: [] });
    const res = await assignBesteller(supabase, ctx);
    expect(res.bestellerKuerzel).toBe("MT");
    expect(res.zuordnungsMethode).toBe("haendler_affinitaet");
  });

  it("uebergeht MT und nimmt den aktiven Besteller, wenn dessen Historie reicht", async () => {
    const supabase = makeSupabaseMock({ historie: [...mt(9), ...cr(4)], inaktiv: ["MT"] });
    const res = await assignBesteller(supabase, ctx);
    expect(res.bestellerKuerzel).toBe("CR");
  });

  it("faellt auf UNBEKANNT statt auf duenne Restdaten zu raten", async () => {
    // Nach dem Filter bleiben 2 CR-Zeilen — unter der >= 3-Schwelle.
    const supabase = makeSupabaseMock({ historie: [...mt(20), ...cr(2)], inaktiv: ["MT"] });
    const res = await assignBesteller(supabase, ctx);
    expect(res.bestellerKuerzel).toBe("UNBEKANNT");
    expect(res.zuordnungsMethode).toBe("unbekannt");
  });

  it("schlaegt MT auch nicht mehr als Pool-Hinweis vor", async () => {
    const supabase = makeSupabaseMock({ historie: mt(20), inaktiv: ["MT"] });
    const res = await assignBesteller(supabase, ctx);
    expect(res.bestellerKuerzel).toBe("UNBEKANNT");
    expect(res.vorschlagKuerzel).not.toBe("MT");
  });

  it("bleibt fail-open: DB-Fehler beim Laden der Inaktiven haelt die Pipeline nicht an", async () => {
    const supabase = makeSupabaseMock({
      historie: [...mt(9), ...cr(1)], inaktiv: ["MT"], inaktivWirftFehler: true,
    });
    const res = await assignBesteller(supabase, ctx);
    // Ohne Filterliste greift das alte Verhalten — Hauptsache kein Throw.
    expect(res.bestellerKuerzel).toBe("MT");
  });
});
