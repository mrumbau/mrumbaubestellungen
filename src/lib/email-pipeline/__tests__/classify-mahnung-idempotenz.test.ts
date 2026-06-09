/**
 * Tests für die Per-Mail-Idempotenz im Mahn-Pfad (09.06.2026).
 *
 * Wenn dieselbe `internet_message_id` für dieselbe Bestellung schon einmal
 * als Mahnung gezählt wurde (status='irrelevant' + error_msg='mahnung_markiert'
 * + bestellung_id), darf der nächste Pipeline-Lauf (Backfill/Retry) den
 * Counter NICHT erneut hochziehen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockChat = vi.fn();
const mockRpc = vi.fn();
const mockMaybeSingleLog = vi.fn();
const mockMaybeSingleBest = vi.fn();

vi.mock("@/lib/openai", () => ({
  chatCompletion: (params: unknown) => mockChat(params),
}));
vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  createServiceClient: vi.fn(),
}));

// Supabase-Mock: minimaler Service-Client der genau die in classify-logic
// vorkommenden Tabellen unterstützt.
function makeSupabase(opts: {
  haendler?: Array<{ id: string; name: string; domain: string; email_absender: string[] | null }>;
  offeneBestellung?: { id: string; bestellnummer: string; mahnung_count: number; dokumente: Array<{ bezahlt_bereits: boolean | null; typ: string | null }> } | null;
  logTreffer?: { internet_message_id: string } | null;
}) {
  mockMaybeSingleLog.mockResolvedValue({ data: opts.logTreffer ?? null, error: null });
  mockMaybeSingleBest.mockResolvedValue({ data: opts.offeneBestellung ?? null, error: null });

  return {
    from: vi.fn((table: string) => {
      if (table === "email_blacklist") {
        return { select: () => Promise.resolve({ data: [], error: null }) };
      }
      if (table === "verworfene_emails") {
        return {
          select: () => ({
            order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
          }),
        };
      }
      if (table === "haendler") {
        return { select: () => Promise.resolve({ data: opts.haendler ?? [], error: null }) };
      }
      if (table === "subunternehmer") {
        return { select: () => Promise.resolve({ data: [], error: null }) };
      }
      if (table === "bestellungen") {
        // Mahn-Pfad: .from("bestellungen").select(...).eq().eq().is().not()
        //   .not().not().eq() (mahnungNrMatch) .maybeSingle()
        // wir geben einen chain mit terminal maybeSingle() zurück
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: () => mockMaybeSingleBest(),
        };
        return chain;
      }
      if (table === "email_processing_log") {
        // Per-Mail-Idempotenz-Check
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: () => mockMaybeSingleLog(),
        };
        return chain;
      }
      return { select: vi.fn() };
    }),
    rpc: (fn: string, params: unknown) => mockRpc(fn, params),
  };
}

import { classifyEmailLogic } from "../classify-logic";

const HAENDLER = {
  id: "h1",
  name: "Reichelt Elektronik",
  domain: "reichelt.de",
  email_absender: null as string[] | null,
};

describe("Mahnungs-Idempotenz pro internet_message_id", () => {
  beforeEach(() => {
    mockChat.mockReset();
    mockRpc.mockReset();
    mockMaybeSingleLog.mockReset();
    mockMaybeSingleBest.mockReset();
  });

  it("Erst-Klassifikation: RPC wird gerufen, Counter incrementiert", async () => {
    const supabase = makeSupabase({
      haendler: [HAENDLER],
      offeneBestellung: {
        id: "bestellung-1",
        bestellnummer: "12345",
        mahnung_count: 1,
        dokumente: [],
      },
      logTreffer: null, // noch keine Spur in email_processing_log
    });
    mockRpc.mockResolvedValue({ data: 2, error: null });

    const result = await classifyEmailLogic(
      {
        email_absender: "rechnung@reichelt.de",
        email_betreff: "Mahnung Rechnung 12345",
        email_vorschau: "Wir bitten um Begleichung",
        hat_anhaenge: true,
        internet_message_id: "<mahn-mail-1@reichelt.de>",
      },
      supabase as never,
    );

    expect(result.grund).toBe("mahnung_markiert");
    expect(mockRpc).toHaveBeenCalledWith("increment_mahnung", {
      p_bestellung_id: "bestellung-1",
    });
  });

  it("Re-Klassifikation derselben Mail: RPC NICHT erneut gerufen", async () => {
    const supabase = makeSupabase({
      haendler: [HAENDLER],
      offeneBestellung: {
        id: "bestellung-1",
        bestellnummer: "12345",
        mahnung_count: 2,
        dokumente: [],
      },
      // Mail wurde schon einmal als Mahnung verbucht
      logTreffer: { internet_message_id: "<mahn-mail-1@reichelt.de>" },
    });

    const result = await classifyEmailLogic(
      {
        email_absender: "rechnung@reichelt.de",
        email_betreff: "Mahnung Rechnung 12345",
        email_vorschau: "Wir bitten um Begleichung",
        hat_anhaenge: true,
        internet_message_id: "<mahn-mail-1@reichelt.de>",
      },
      supabase as never,
    );

    expect(result.grund).toBe("mahnung_markiert"); // gleicher Outcome
    expect(mockRpc).not.toHaveBeenCalled(); // aber KEIN Increment mehr
  });

  it("Ohne internet_message_id: kein Idempotenz-Check, RPC läuft (Legacy-Pfad)", async () => {
    const supabase = makeSupabase({
      haendler: [HAENDLER],
      offeneBestellung: {
        id: "bestellung-1",
        bestellnummer: "12345",
        mahnung_count: 0,
        dokumente: [],
      },
      logTreffer: null,
    });
    mockRpc.mockResolvedValue({ data: 1, error: null });

    const result = await classifyEmailLogic(
      {
        email_absender: "rechnung@reichelt.de",
        email_betreff: "Mahnung Rechnung 12345",
        email_vorschau: "Wir bitten um Begleichung",
        hat_anhaenge: true,
        // KEINE internet_message_id übergeben
      },
      supabase as never,
    );

    expect(result.grund).toBe("mahnung_markiert");
    expect(mockRpc).toHaveBeenCalled();
  });

  it("PayPal-Bezahlt blockt Mahnung — kein RPC + kein Counter-Anstieg", async () => {
    const supabase = makeSupabase({
      haendler: [HAENDLER],
      offeneBestellung: {
        id: "bestellung-1",
        bestellnummer: "12345",
        mahnung_count: 0,
        dokumente: [{ typ: "rechnung", bezahlt_bereits: true }],
      },
      logTreffer: null,
    });

    const result = await classifyEmailLogic(
      {
        email_absender: "rechnung@reichelt.de",
        email_betreff: "Mahnung Rechnung 12345",
        email_vorschau: "—",
        hat_anhaenge: true,
        internet_message_id: "<paypal-mahn@x.com>",
      },
      supabase as never,
    );

    expect(result.grund).toBe("mahnung_markiert");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("Stufe 10 erreicht: kein weiterer Increment", async () => {
    const supabase = makeSupabase({
      haendler: [HAENDLER],
      offeneBestellung: {
        id: "bestellung-1",
        bestellnummer: "12345",
        mahnung_count: 10,
        dokumente: [],
      },
      logTreffer: null,
    });

    await classifyEmailLogic(
      {
        email_absender: "rechnung@reichelt.de",
        email_betreff: "Mahnung Rechnung 12345",
        email_vorschau: "—",
        hat_anhaenge: true,
        internet_message_id: "<m@x.com>",
      },
      supabase as never,
    );

    expect(mockRpc).not.toHaveBeenCalled();
  });
});
