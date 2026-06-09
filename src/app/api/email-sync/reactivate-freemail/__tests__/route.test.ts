/**
 * Tests für POST /api/email-sync/reactivate-freemail (09.06.2026).
 *
 * Backfill-Endpoint für fälschlich als 'freemail' verworfene Mails.
 * Reaktiviert Mails mit kaufmännischen Hard-Keywords im Subject auf
 * status='pending', sodass der process-pending-Cron sie unter der NEUEN
 * classify-logic (mit Inhalts-Override) neu klassifiziert.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { TEST_PROFIL } from "@/test-helpers/api-route";

const mockCheckCsrf = vi.fn(() => true);
const mockGetProfil = vi.fn();
const mockCreateServiceClient = vi.fn();

vi.mock("@/lib/csrf", () => ({
  checkCsrf: () => mockCheckCsrf(),
}));
vi.mock("@/lib/auth", () => ({
  getBenutzerProfil: () => mockGetProfil(),
  requireRoles: (profil: { rolle?: string } | null, ...roles: string[]) =>
    !!(profil?.rolle && roles.includes(profil.rolle)),
}));
vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => mockCreateServiceClient(),
}));
vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

function makeRequest(body: Record<string, unknown> = {}, opts: { origin?: string } = {}) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: opts.origin ?? "http://localhost:3000",
  };
  return new NextRequest("http://localhost:3000/api/email-sync/reactivate-freemail", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

interface Candidate {
  internet_message_id: string;
  received_at: string;
  sender: string;
  subject: string;
}

interface ServiceOpts {
  /** Total-Count der Freemail-Drops (für total_found) */
  totalFreemailDrops?: number;
  /** Kandidaten nach Keyword-Filter (= subjects mit hard-keyword) */
  candidates?: Candidate[];
  /** Pro-ID Update-Errors zur Simulation */
  updateErrors?: Map<string, string>;
  /** Count-Query-Error */
  countError?: string;
  /** Kandidaten-Query-Error */
  candidatesError?: string;
}

function makeServiceClient(opts: ServiceOpts = {}) {
  const updates: Array<{ internetMessageId: string; patch: Record<string, unknown> }> = [];
  const totalCount = opts.totalFreemailDrops ?? 0;
  const candidates = opts.candidates ?? [];

  const from = vi.fn((table: string) => {
    if (table !== "email_processing_log") {
      return { select: vi.fn(), update: vi.fn() };
    }
    return {
      select: vi.fn((cols: string, options?: { count?: string; head?: boolean }) => {
        // COUNT-Query-Pfad: select("...", { count: "exact", head: true })
        if (options?.count === "exact" && options.head) {
          return {
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn(() => {
              if (opts.countError) {
                return Promise.resolve({
                  count: 0,
                  error: { message: opts.countError },
                });
              }
              return Promise.resolve({ count: totalCount, error: null });
            }),
          };
        }
        // Kandidaten-Query-Pfad: select("...").eq(...).eq(...).gte(...).or(...).order(...).limit(...)
        const chain = {
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn(() => {
            if (opts.candidatesError) {
              return Promise.resolve({
                data: null,
                error: { message: opts.candidatesError },
              });
            }
            return Promise.resolve({ data: candidates, error: null });
          }),
        };
        // chain.eq, gte, or, order müssen das chain selbst returnen für Method-Chaining
        chain.eq.mockReturnValue(chain);
        chain.gte.mockReturnValue(chain);
        chain.or.mockReturnValue(chain);
        chain.order.mockReturnValue(chain);
        return chain;
      }),
      update: (patch: Record<string, unknown>) => {
        // Update-Chain: .update({...}).eq("internet_message_id", X).eq("status", ...).eq("error_msg", ...)
        const eqMock = vi.fn();
        let internetMessageId = "";
        eqMock.mockImplementation((col: string, val: string) => {
          if (col === "internet_message_id") internetMessageId = val;
          // Letzter .eq() returnt die Promise (status/error_msg-eq)
          if (col === "error_msg") {
            const errMsg = opts.updateErrors?.get(internetMessageId);
            if (errMsg) {
              return Promise.resolve({ data: null, error: { message: errMsg } });
            }
            updates.push({ internetMessageId, patch });
            return Promise.resolve({ data: null, error: null });
          }
          return { eq: eqMock };
        });
        return { eq: eqMock };
      },
    };
  });
  return { from, updates };
}

describe("POST /api/email-sync/reactivate-freemail", () => {
  beforeEach(() => {
    mockCheckCsrf.mockReset().mockReturnValue(true);
    mockGetProfil.mockReset();
    mockCreateServiceClient.mockReset();
  });

  it("403 bei CSRF-Fail", async () => {
    mockCheckCsrf.mockReturnValue(false);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ dryRun: true }, { origin: "http://evil.com" }));
    expect(res.status).toBe(403);
  });

  it("403 für Buchhaltung (NJ)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.buchhaltung);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ dryRun: true }));
    expect(res.status).toBe(403);
  });

  it("Besteller darf reaktivieren (Firmeninhaber-Pfad)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_MT);
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      totalFreemailDrops: 0,
      candidates: [],
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ dryRun: true }));
    expect(res.status).toBe(200);
  });

  it("Admin darf reaktivieren", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      totalFreemailDrops: 0,
      candidates: [],
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ dryRun: true }));
    expect(res.status).toBe(200);
  });

  it("400 bei sinceDays > 90", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ sinceDays: 100, dryRun: true }));
    expect(res.status).toBe(400);
  });

  it("400 bei sinceDays = 0 / negative", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ sinceDays: 0, dryRun: true }));
    expect(res.status).toBe(400);
  });

  it("dryRun=true verändert NICHTS (kein update aufgerufen)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    const candidates = [
      {
        internet_message_id: "<msg-1@example.com>",
        received_at: "2026-06-08T11:17:00Z",
        sender: "glas-gebhardt@t-online.de",
        subject: "Rechnung 123329 - Mahnung",
      },
    ];
    const service = makeServiceClient({
      totalFreemailDrops: 5,
      candidates,
    });
    mockCreateServiceClient.mockReturnValue(service);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ dryRun: true, sinceDays: 30 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.dryRun).toBe(true);
    expect(json.total_found).toBe(5);
    expect(json.candidates_for_reactivation).toBe(1);
    expect(json.skipped).toBe(4);
    expect(json.reactivated).toBe(0);
    expect(service.updates).toHaveLength(0); // KEINE Mutation
  });

  it("Glas-Gebhardt-Mail erscheint im DryRun als Kandidat mit reason='hard-keyword: rechnung'", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    const candidates = [
      {
        internet_message_id: "<glas-gebhardt-msg@t-online.de>",
        received_at: "2026-06-08T11:17:00Z",
        sender: "glas-gebhardt@t-online.de",
        subject: "Rechnung 123329 - Mahnung",
      },
    ];
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      totalFreemailDrops: 1,
      candidates,
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ dryRun: true }));
    const json = await res.json();
    expect(json.examples).toHaveLength(1);
    expect(json.examples[0].sender).toBe("glas-gebhardt@t-online.de");
    expect(json.examples[0].subject).toBe("Rechnung 123329 - Mahnung");
    // Hard-Keyword "rechnung" wird als erstes gematched
    expect(json.examples[0].reason).toContain("rechnung");
  });

  it("dryRun=false reaktiviert Kandidaten (status → pending)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    const candidates = [
      { internet_message_id: "<a@x.com>", received_at: "2026-06-08T11:17:00Z", sender: "a@t-online.de", subject: "Rechnung 1" },
      { internet_message_id: "<b@x.com>", received_at: "2026-06-08T11:30:00Z", sender: "b@gmx.de", subject: "Mahnung 2" },
    ];
    const service = makeServiceClient({ totalFreemailDrops: 2, candidates });
    mockCreateServiceClient.mockReturnValue(service);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ dryRun: false, sinceDays: 30 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.dryRun).toBe(false);
    expect(json.reactivated).toBe(2);
    expect(json.errors).toHaveLength(0);
    expect(service.updates).toHaveLength(2);
    expect(service.updates[0].patch.status).toBe("pending");
    expect(service.updates[0].patch.error_msg).toBe(null);
    expect(service.updates[0].patch.retry_count).toBe(0);
  });

  it("Partial-Failure: 1 Update failt → reactivated=1, errors=[1]", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    const candidates = [
      { internet_message_id: "<ok@x.com>", received_at: "2026-06-08T11:17:00Z", sender: "a@t-online.de", subject: "Rechnung A" },
      { internet_message_id: "<bad@x.com>", received_at: "2026-06-08T11:30:00Z", sender: "b@gmx.de", subject: "Rechnung B" },
    ];
    const updateErrors = new Map<string, string>([
      ["<bad@x.com>", "concurrent update conflict"],
    ]);
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      totalFreemailDrops: 2,
      candidates,
      updateErrors,
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ dryRun: false }));
    const json = await res.json();
    expect(json.reactivated).toBe(1);
    expect(json.errors).toHaveLength(1);
    expect(json.errors[0].internet_message_id).toBe("<bad@x.com>");
    expect(json.errors[0].reason).toContain("concurrent");
  });

  it("Count-Query-Error → 500", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      countError: "DB-Connection-Lost",
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ dryRun: true }));
    expect(res.status).toBe(500);
  });

  it("sinceDays default = 30 wenn nicht angegeben", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      totalFreemailDrops: 0,
      candidates: [],
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ dryRun: true }));
    const json = await res.json();
    expect(json.sinceDays).toBe(30);
  });

  it("Examples werden auf max 10 begrenzt", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    const candidates = Array.from({ length: 15 }, (_, i) => ({
      internet_message_id: `<msg-${i}@x.com>`,
      received_at: "2026-06-08T11:17:00Z",
      sender: `user${i}@t-online.de`,
      subject: `Rechnung ${i}`,
    }));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      totalFreemailDrops: 15,
      candidates,
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ dryRun: true }));
    const json = await res.json();
    expect(json.candidates_for_reactivation).toBe(15);
    expect(json.examples).toHaveLength(10); // Beispiele auf 10 gekappt
  });
});
