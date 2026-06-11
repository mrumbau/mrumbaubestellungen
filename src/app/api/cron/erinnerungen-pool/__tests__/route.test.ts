/**
 * Tests für POST /api/cron/erinnerungen-pool (11.06.2026).
 *
 * Fokus: Feature-Flag POOL_DIGEST_ENABLED — wenn ≠ "true", macht der Cron
 * ein deterministisches no-op (keine Mail, kein mahnung_count-Update,
 * kein webhook_logs-Insert).
 *
 * Default = off. Re-Aktivierung über Vercel-Env explizit. User-Wunsch:
 * keine täglichen bu@mrumbau.de-Pool-Sammelmails an alle Besteller.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockCreateServiceClient = vi.fn();
const mockSendeMail = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => mockCreateServiceClient(),
}));
vi.mock("@/lib/email", () => ({
  sendeMahnungEmail: (opts: unknown) => mockSendeMail(opts),
}));
vi.mock("@/lib/logger", () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}));
vi.mock("@/lib/safe-compare", () => ({
  safeCompare: (a: string, b: string) => a === b,
}));
vi.mock("@/lib/email-pipeline/pipeline/reply-action", () => ({
  ensureReplyToken: vi.fn(() => Promise.resolve("test-token")),
}));

function makeRequest(body: Record<string, unknown> = {}, secret = "test-cron-secret") {
  return new NextRequest("http://localhost:3000/api/cron/erinnerungen-pool", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/cron/erinnerungen-pool", () => {
  beforeEach(() => {
    mockCreateServiceClient.mockReset();
    mockSendeMail.mockReset();
    process.env.CRON_SECRET = "test-cron-secret";
    // Default: Feature explizit OFF, weil User-Wunsch
    process.env.POOL_DIGEST_ENABLED = undefined;
  });

  it("401 bei fehlendem CRON_SECRET-Header", async () => {
    const req = new NextRequest("http://localhost:3000/api/cron/erinnerungen-pool", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const { POST } = await import("../route");
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("Feature-Flag aus (Default): kein Versand, kein DB-Zugriff, success: true + disabled: true", async () => {
    delete process.env.POOL_DIGEST_ENABLED;
    const { POST } = await import("../route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.disabled).toBe(true);
    expect(json.gesendet).toBe(0);
    expect(json.message).toContain("POOL_DIGEST_ENABLED");
    // Wichtig: createServiceClient darf NIEMALS gerufen werden im no-op-Pfad,
    // damit keine Bestellung versehentlich angefasst wird (mahnung_count!).
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
    expect(mockSendeMail).not.toHaveBeenCalled();
  });

  it("Feature-Flag = 'false' (explizit): immer noch kein Versand", async () => {
    process.env.POOL_DIGEST_ENABLED = "false";
    const { POST } = await import("../route");
    const res = await POST(makeRequest());
    const json = await res.json();
    expect(json.disabled).toBe(true);
    expect(mockSendeMail).not.toHaveBeenCalled();
  });

  it("Feature-Flag = 'TRUE' Großbuchstaben: case-sensitive, immer noch off", async () => {
    // Defensive: nur exakt "true" aktiviert. Tippfehler/Großschreibung blockt.
    process.env.POOL_DIGEST_ENABLED = "TRUE";
    const { POST } = await import("../route");
    const res = await POST(makeRequest());
    const json = await res.json();
    expect(json.disabled).toBe(true);
  });

  it("Feature-Flag = 'true': Logik läuft (smoke — Pool leer)", async () => {
    process.env.POOL_DIGEST_ENABLED = "true";
    // Pool leer: kurzer Pfad, keine Mail, aber DB wird gefragt.
    const eqChain = {
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const fromBestellungen = { select: vi.fn().mockReturnValue(eqChain) };
    mockCreateServiceClient.mockReturnValue({
      from: vi.fn((tbl: string) => {
        if (tbl === "bestellungen") return fromBestellungen;
        return { select: vi.fn(), insert: vi.fn() };
      }),
    });
    const { POST } = await import("../route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    // Wenn Flag an + Pool leer: kein Versand, aber kein disabled-Flag mehr
    expect(json.disabled).toBeUndefined();
    expect(json.gesendet).toBe(0);
    expect(mockCreateServiceClient).toHaveBeenCalled();
  });
});
