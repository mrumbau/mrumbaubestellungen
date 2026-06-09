/**
 * Tests für POST /api/admin/mahnung-cleanup (09.06.2026).
 *
 * Endpoint findet Bestellungen mit fachlich falscher Mahnstufe und kann
 * sie auf 0/NULL zurücksetzen. dryRun verändert nichts.
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
  return new NextRequest("http://localhost:3000/api/admin/mahnung-cleanup", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

interface BestellRow {
  id: string;
  bestellnummer: string | null;
  haendler_name: string | null;
  mahnung_count: number | null;
  mahnung_am: string | null;
  hat_rechnung: boolean | null;
  bezahlt_am: string | null;
  status: string | null;
  dokumente: Array<{ typ: string | null; bezahlt_bereits: boolean | null }> | null;
}

interface ServiceOpts {
  rows?: BestellRow[];
  updateErrors?: Map<string, string>;
  queryError?: string;
}

function makeServiceClient(opts: ServiceOpts = {}) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const rows = opts.rows ?? [];

  const from = vi.fn((table: string) => {
    if (table !== "bestellungen") {
      return { select: vi.fn(), update: vi.fn() };
    }
    return {
      select: vi.fn(() => {
        const chain = {
          gt: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn(() => {
            if (opts.queryError) {
              return Promise.resolve({
                data: null,
                error: { message: opts.queryError },
              });
            }
            return Promise.resolve({ data: rows, error: null });
          }),
        };
        chain.gt.mockReturnValue(chain);
        chain.order.mockReturnValue(chain);
        return chain;
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => {
          const errMsg = opts.updateErrors?.get(id);
          if (errMsg) {
            return Promise.resolve({ data: null, error: { message: errMsg } });
          }
          updates.push({ id, patch });
          return Promise.resolve({ data: null, error: null });
        },
      }),
    };
  });
  return { from, updates };
}

const HEUTE = "2026-06-09T10:00:00Z";

function mkRow(over: Partial<BestellRow>): BestellRow {
  return {
    id: over.id ?? "00000000-0000-4000-8000-000000000000",
    bestellnummer: over.bestellnummer ?? "12345",
    haendler_name: over.haendler_name ?? "TestVendor",
    mahnung_count: over.mahnung_count ?? 1,
    mahnung_am: over.mahnung_am ?? HEUTE,
    hat_rechnung: over.hat_rechnung ?? true,
    bezahlt_am: over.bezahlt_am ?? null,
    status: over.status ?? "offen",
    dokumente: over.dokumente ?? null,
  };
}

describe("POST /api/admin/mahnung-cleanup", () => {
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

  it("403 für Buchhaltung", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.buchhaltung);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ dryRun: true }));
    expect(res.status).toBe(403);
  });

  it("Besteller darf cleanup ausführen", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_MT);
    mockCreateServiceClient.mockReturnValue(makeServiceClient({ rows: [] }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ dryRun: true }));
    expect(res.status).toBe(200);
  });

  it("dryRun=true verändert nichts (keine update-Calls)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    const rows = [
      mkRow({ id: "11111111-1111-4111-8111-111111111111", hat_rechnung: false }),
    ];
    const service = makeServiceClient({ rows });
    mockCreateServiceClient.mockReturnValue(service);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ dryRun: true }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.dryRun).toBe(true);
    expect(json.candidates_to_reset).toBe(1);
    expect(json.reset_done).toBe(0);
    expect(service.updates).toHaveLength(0);
  });

  it("Default = dryRun=true (Body ohne Flag)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    mockCreateServiceClient.mockReturnValue(makeServiceClient({ rows: [] }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({}));
    const json = await res.json();
    expect(json.dryRun).toBe(true);
  });

  it("kategorisiert: keine Rechnung → reset", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    const rows = [
      mkRow({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", hat_rechnung: false }),
    ];
    mockCreateServiceClient.mockReturnValue(makeServiceClient({ rows }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ dryRun: true }));
    const json = await res.json();
    expect(json.candidates_to_reset).toBe(1);
    expect(json.candidates_to_review).toBe(0);
    expect(json.examples[0].grund).toContain("keine Rechnung");
  });

  it("kategorisiert: PayPal-bezahlt → reset", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    const rows = [
      mkRow({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        hat_rechnung: true,
        dokumente: [{ typ: "rechnung", bezahlt_bereits: true }],
      }),
    ];
    mockCreateServiceClient.mockReturnValue(makeServiceClient({ rows }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ dryRun: true }));
    const json = await res.json();
    expect(json.candidates_to_reset).toBe(1);
    expect(json.examples[0].grund).toContain("PayPal");
  });

  it("kategorisiert: bezahlt_am gesetzt → reset", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    const rows = [
      mkRow({
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        hat_rechnung: true,
        bezahlt_am: HEUTE,
      }),
    ];
    mockCreateServiceClient.mockReturnValue(makeServiceClient({ rows }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ dryRun: true }));
    const json = await res.json();
    expect(json.candidates_to_reset).toBe(1);
    expect(json.examples[0].grund).toContain("bezahlt_am");
  });

  it("kategorisiert: terminaler Status → reset", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    const rows = [
      mkRow({
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        hat_rechnung: true,
        status: "freigegeben",
      }),
    ];
    mockCreateServiceClient.mockReturnValue(makeServiceClient({ rows }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ dryRun: true }));
    const json = await res.json();
    expect(json.candidates_to_reset).toBe(1);
    expect(json.examples[0].grund).toContain("terminaler Status");
  });

  it("kategorisiert: mahnung_count > 3 ohne Reset-Grund → review", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    const rows = [
      mkRow({
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        mahnung_count: 7,
        hat_rechnung: true,
        status: "offen",
      }),
    ];
    mockCreateServiceClient.mockReturnValue(makeServiceClient({ rows }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ dryRun: true }));
    const json = await res.json();
    expect(json.candidates_to_reset).toBe(0);
    expect(json.candidates_to_review).toBe(1);
    expect(json.examples[0].grund).toContain("ohne klare Quelle");
  });

  it("plausible Mahnung (Stufe 1, mit Rechnung, nicht bezahlt) wird NICHT angefasst", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    const rows = [
      mkRow({
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        mahnung_count: 1,
        hat_rechnung: true,
        status: "offen",
      }),
    ];
    mockCreateServiceClient.mockReturnValue(makeServiceClient({ rows }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ dryRun: true }));
    const json = await res.json();
    expect(json.candidates_to_reset).toBe(0);
    expect(json.candidates_to_review).toBe(0);
  });

  it("dryRun=false: reset-Kandidaten werden auf 0/NULL gepatcht, review nicht", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    const rows = [
      // reset (keine Rechnung)
      mkRow({ id: "11111111-1111-4111-8111-111111111111", hat_rechnung: false }),
      // review (Stufe 7, sonst ok)
      mkRow({
        id: "22222222-2222-4222-8222-222222222222",
        mahnung_count: 7,
        hat_rechnung: true,
      }),
    ];
    const service = makeServiceClient({ rows });
    mockCreateServiceClient.mockReturnValue(service);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ dryRun: false }));
    const json = await res.json();
    expect(json.dryRun).toBe(false);
    expect(json.reset_done).toBe(1);
    expect(service.updates).toHaveLength(1);
    expect(service.updates[0].id).toBe("11111111-1111-4111-8111-111111111111");
    expect(service.updates[0].patch.mahnung_count).toBe(0);
    expect(service.updates[0].patch.mahnung_am).toBeNull();
  });

  it("Query-Error → 500", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    mockCreateServiceClient.mockReturnValue(makeServiceClient({ queryError: "DB-Lost" }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ dryRun: true }));
    expect(res.status).toBe(500);
  });

  it("examples enthalten max 10 Einträge (Mix aus reset + review)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    const rows: BestellRow[] = [];
    for (let i = 0; i < 15; i++) {
      rows.push(
        mkRow({
          id: `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`,
          hat_rechnung: false,
        }),
      );
    }
    mockCreateServiceClient.mockReturnValue(makeServiceClient({ rows }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ dryRun: true }));
    const json = await res.json();
    expect(json.candidates_to_reset).toBe(15);
    expect(json.examples.length).toBeLessThanOrEqual(10);
  });
});
