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

type RegelTreffer = { rule_id: string; target_kuerzel: string; confidence: number; rule_name: string };

function makeSupabaseMock(opts: {
  historie: HistorieZeile[];
  inaktiv: string[];
  benutzer?: Array<{ kuerzel: string; name: string; email: string }>;
  inaktivWirftFehler?: boolean;
  /** Was die Regel-Engine (Stufe -1) zurueckgibt. Leer = keine Regel greift. */
  regeln?: RegelTreffer[];
  /** Faengt die Argumente auf, mit denen die Regel-Engine gerufen wurde. */
  rpcArgs?: { letzte?: Record<string, unknown> };
}) {
  const benutzer = opts.benutzer ?? [
    { kuerzel: "MT", name: "Marlon Tschon", email: "mt@mrumbau.de" },
    { kuerzel: "CR", name: "Carsten Reuter", email: "cr@reuter-mr.de" },
  ];

  const client = {
    rpc: async (_name: string, args: Record<string, unknown>) => {
      if (opts.rpcArgs) opts.rpcArgs.letzte = args;
      return { data: opts.regeln ?? [] };
    },
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
  emailAbsender: "rechnung@bauhaus.de",
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

  const zweiAktive = [
    { kuerzel: "MT", name: "Marlon Tschon", email: "mt@mrumbau.de" },
    { kuerzel: "CR", name: "Carsten Reuter", email: "cr@reuter-mr.de" },
    { kuerzel: "BL", name: "Bau Leiter", email: "bl@mrumbau.de" },
  ];

  it("faellt auf UNBEKANNT statt auf duenne Restdaten zu raten", async () => {
    // Nach dem Filter bleiben 2 CR-Zeilen — unter der >= 3-Schwelle.
    // Zwei aktive Besteller (CR, BL): die Einziger-Besteller-Stufe greift nicht.
    const supabase = makeSupabaseMock({ historie: [...mt(20), ...cr(2)], inaktiv: ["MT"], benutzer: zweiAktive });
    const res = await assignBesteller(supabase, ctx);
    expect(res.bestellerKuerzel).toBe("UNBEKANNT");
    expect(res.zuordnungsMethode).toBe("unbekannt");
  });

  it("schlaegt MT auch nicht mehr als Pool-Hinweis vor", async () => {
    const supabase = makeSupabaseMock({ historie: mt(20), inaktiv: ["MT"], benutzer: zweiAktive });
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

describe("assignBesteller — Stufe -1 (Regel-Engine)", () => {
  it("weist nach Regel zu, wenn das Ziel noch Bestellungen annimmt", async () => {
    const supabase = makeSupabaseMock({
      historie: [],
      inaktiv: ["MT"],
      regeln: [{ rule_id: "r1", target_kuerzel: "CR", confidence: 0.9, rule_name: "Bauhaus an CR" }],
    });
    const res = await assignBesteller(supabase, ctx);
    expect(res.bestellerKuerzel).toBe("CR");
    expect(res.zuordnungsMethode).toBe("rule:Bauhaus an CR");
    expect(res.vorschlagKonfidenz).toBe(0.9);
  });

  it("verwirft den Treffer, wenn die Regel auf einen Ausgeschiedenen zeigt", async () => {
    // Die Regel ist aelter als der Weggang. Ohne Pruefung liefe sie weiter
    // auf MT — die Bestellung soll stattdessen in den Pool fallen.
    const supabase = makeSupabaseMock({
      historie: [],
      inaktiv: ["MT"],
      benutzer: [
        { kuerzel: "MT", name: "Marlon Tschon", email: "mt@mrumbau.de" },
        { kuerzel: "CR", name: "Carsten Reuter", email: "cr@reuter-mr.de" },
        { kuerzel: "BL", name: "Bau Leiter", email: "bl@mrumbau.de" },
      ],
      regeln: [{ rule_id: "r1", target_kuerzel: "MT", confidence: 0.99, rule_name: "Alte Regel auf MT" }],
    });
    const res = await assignBesteller(supabase, ctx);
    expect(res.bestellerKuerzel).toBe("UNBEKANNT");
    expect(res.zuordnungsMethode).toBe("unbekannt");
  });

  it("uebergibt der Regel-Engine die echte Absenderadresse, nicht den Haendlernamen", async () => {
    // Bis 30.09.2026 kam hier der Haendlername an, weshalb jede Regel vom
    // Typ absender_pattern still nie griff.
    const rpcArgs: { letzte?: Record<string, unknown> } = {};
    const supabase = makeSupabaseMock({ historie: [], inaktiv: [], rpcArgs });
    await assignBesteller(supabase, ctx);
    expect(rpcArgs.letzte?.p_email_absender).toBe("rechnung@bauhaus.de");
  });
});

describe("assignBesteller — Stufe 5 (einziger aktiver Besteller)", () => {
  it("ordnet dem einzigen aktiven Besteller direkt zu, statt in den Pool zu legen", async () => {
    // MT inaktiv, CR der einzige, der Bestellungen annimmt — keine Historie,
    // keine Regel. Vorher: UNBEKANNT und 68 Tage im Pool.
    const supabase = makeSupabaseMock({ historie: [], inaktiv: ["MT"] });
    const res = await assignBesteller(supabase, ctx);
    expect(res.bestellerKuerzel).toBe("CR");
    expect(res.zuordnungsMethode).toBe("einziger_besteller");
    expect(res.vorschlagKonfidenz).toBe(1);
  });

  it("schaltet sich ab, sobald mehr als einer aktiv ist", async () => {
    const supabase = makeSupabaseMock({ historie: [], inaktiv: [] });
    const res = await assignBesteller(supabase, ctx);
    expect(res.bestellerKuerzel).toBe("UNBEKANNT");
  });

  it("greift nicht vor den anderen Stufen — eine Regel gewinnt weiterhin", async () => {
    const supabase = makeSupabaseMock({
      historie: [], inaktiv: ["MT"],
      regeln: [{ rule_id: "r1", target_kuerzel: "CR", confidence: 0.9, rule_name: "Bauhaus an CR" }],
    });
    const res = await assignBesteller(supabase, ctx);
    expect(res.zuordnungsMethode).toBe("rule:Bauhaus an CR");
  });
});
