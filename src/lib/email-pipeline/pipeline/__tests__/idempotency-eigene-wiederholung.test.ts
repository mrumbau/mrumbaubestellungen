/**
 * Eine Mail scheitert nicht an ihrem eigenen 24h-Hash (10.10.2026).
 *
 * Befund: "erneut" im Eingang (und der Retry-Cron) liefen binnen 24 Stunden
 * nach dem ersten Versuch immer in "duplikat_24h" — der Hash-Lock aus dem
 * ersten Versuch stammte von derselben Mail. Zehn nachverarbeitete Mails
 * standen deshalb wieder als "ohne Bestellung" im Eingang.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { bewerteHashTreffer, checkAndClaimIdempotency } from "../idempotency-check";

describe("bewerteHashTreffer", () => {
  it("eine andere Mail traegt die Bestellung → Duplikat mit Bestellung", () => {
    expect(bewerteHashTreffer({ eigeneMessageId: "<a@x>", fremdeBestellungId: "b-1" })).toEqual({
      isDuplicate: true,
      bestellungId: "b-1",
    });
  });

  it("ohne eigene Kennung bleibt ein Hash-Treffer ein Duplikat (Webhook-Pfad)", () => {
    expect(bewerteHashTreffer({ eigeneMessageId: null, fremdeBestellungId: undefined })).toEqual({ isDuplicate: true });
  });

  it("eigene Wiederholung ohne fremdes Original → kein Duplikat", () => {
    expect(bewerteHashTreffer({ eigeneMessageId: "<a@x>", fremdeBestellungId: undefined })).toEqual({ isDuplicate: false });
  });
});

/** Supabase-Mock: Hash-Lock existiert (Insert-Konflikt, Eintrag juenger als 24h). */
function makeSupabase(logZeilen: Array<{ subject: string; bestellung_id: string | null; internet_message_id: string }>) {
  const ausgeschlossen: string[] = [];
  const aufgefrischt = { n: 0 };
  const from = (table: string) => {
    if (table === "webhook_logs") {
      return {
        insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: "23505", message: "duplicate" } }) }) }),
        select: () => ({ eq: () => ({ eq: () => ({ gte: () => ({ limit: async () => ({ data: [{ id: 1, created_at: new Date().toISOString() }] }) }) }) }) }),
        update: () => ({ eq: () => ({ eq: async () => { aufgefrischt.n++; return { error: null }; } }) }),
      };
    }
    if (table === "email_processing_log") {
      let zeilen = logZeilen;
      const builder = {
        select: () => builder,
        ilike: () => builder,
        not: () => builder,
        gte: () => builder,
        neq: (_c: string, id: string) => { ausgeschlossen.push(id); zeilen = zeilen.filter((z) => z.internet_message_id !== id); return builder; },
        order: () => builder,
        limit: async () => ({ data: zeilen.map((z) => ({ subject: z.subject, bestellung_id: z.bestellung_id })) }),
      };
      return builder;
    }
    throw new Error("unerwartete Tabelle " + table);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: { from } as any, ausgeschlossen, aufgefrischt };
}

const mail = {
  email_absender: "edi@stark-deutschland.de",
  email_betreff: "Rechnung 8779633385",
  email_datum: "2026-10-10T10:00:00Z",
  email_body: "Anbei Ihre Rechnung.",
  anhaenge_count: 1,
};

describe("checkAndClaimIdempotency — eigene Wiederholung", () => {
  it("die eigene Mail noch einmal: kein Duplikat, Lock wird aufgefrischt", async () => {
    const { client, ausgeschlossen, aufgefrischt } = makeSupabase([
      { subject: "Rechnung 8779633385", bestellung_id: "b-eigene", internet_message_id: "<ich@x>" },
    ]);
    const r = await checkAndClaimIdempotency(client, { ...mail, internet_message_id: "<ich@x>" });
    expect(r.isDuplicate).toBe(false);
    expect(ausgeschlossen).toEqual(["<ich@x>"]);
    expect(aufgefrischt.n).toBe(1);
  });

  it("eine andere Mail hat dieselbe Rechnung schon verbucht: Duplikat mit deren Bestellung", async () => {
    const { client } = makeSupabase([
      { subject: "AW: Rechnung 8779633385", bestellung_id: "b-andere", internet_message_id: "<andere@x>" },
    ]);
    const r = await checkAndClaimIdempotency(client, { ...mail, internet_message_id: "<ich@x>" });
    expect(r).toMatchObject({ isDuplicate: true, bestellungId: "b-andere" });
  });

  it("ohne eigene Kennung bleibt der Hash-Treffer ein Duplikat", async () => {
    const { client, ausgeschlossen } = makeSupabase([]);
    const r = await checkAndClaimIdempotency(client, mail);
    expect(r.isDuplicate).toBe(true);
    expect(ausgeschlossen).toEqual([]);
  });
});
