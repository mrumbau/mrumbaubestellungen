/**
 * Tests für POST /api/dokumente/bulk-bezahlt.
 *
 * 19.05.2026 (A2.5) — Mixed-Result-Pattern: marked / already_paid / skipped / errors.
 * Sequenzieller DATEV-Versand (SMTP-rate-limit-safe) via after().
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeRequest, TEST_PROFIL, TEST_UUID } from "@/test-helpers/api-route";

const mockCheckCsrf = vi.fn(() => true);
const mockCreateServerClient = vi.fn();
const mockCreateServiceClient = vi.fn();
const mockAfter = vi.fn();

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: (fn: () => void) => mockAfter(fn) };
});
vi.mock("@/lib/csrf", () => ({ checkCsrf: () => mockCheckCsrf() }));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => mockCreateServerClient(),
  createTypedServerSupabaseClient: () => mockCreateServerClient(),
}));
vi.mock("@/lib/supabase", () => ({ createServiceClient: () => mockCreateServiceClient() }));
vi.mock("@/lib/email", () => ({
  sendeRechnungAnDatev: vi.fn().mockResolvedValue({ success: true }),
  stempelPdfMitDatev: vi.fn().mockImplementation(async (buf) => buf),
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

interface BulkDoku {
  id: string;
  typ: string;
  storage_pfad: string | null;
  bezahlt_am: string | null;
  gesamtbetrag: number | null;
  bestellnummer_erkannt: string | null;
  bestellung_id: string;
  bestellung: {
    id: string;
    status: string;
    bestellnummer: string | null;
    haendler_name: string | null;
    betrag: number | null;
  };
}

function makeAuthClient(user: { id: string } | null, profil?: typeof TEST_PROFIL.buchhaltung) {
  const single = vi.fn().mockResolvedValue({ data: profil ?? null, error: null });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from: vi.fn().mockReturnValue({ select }),
  };
}

function makeServiceClient(opts: { dokus?: BulkDoku[]; loadError?: { message: string } | null }) {
  // SELECT-chain: from("dokumente").select(...).in() → { data, error }
  const inSelect = vi.fn().mockResolvedValue({ data: opts.dokus ?? [], error: opts.loadError ?? null });
  // UPDATE-chain: from("dokumente").update().eq().is() → { error }
  const isUpd = vi.fn().mockResolvedValue({ data: null, error: null });
  const eqUpd = vi.fn().mockReturnValue({ is: isUpd });
  const update = vi.fn().mockReturnValue({ eq: eqUpd });
  const select = vi.fn().mockReturnValue({ in: inSelect });
  const insert = vi.fn().mockResolvedValue({ data: null, error: null });
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "dokumente") return { select, update };
    if (table === "webhook_logs") return { insert };
    return { select, update, insert };
  });
  return { from, _isUpd: isUpd, storage: { from: vi.fn() } };
}

const ID_A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const ID_C = "cccccccc-cccc-4ccc-accc-cccccccccccc";

function makeDoku(id: string, overrides: Partial<BulkDoku> = {}): BulkDoku {
  return {
    id,
    typ: "rechnung",
    storage_pfad: "x.pdf",
    bezahlt_am: null,
    gesamtbetrag: 100,
    bestellnummer_erkannt: "R1",
    bestellung_id: TEST_UUID.bestellung,
    bestellung: { id: TEST_UUID.bestellung, status: "freigegeben", bestellnummer: "B1", haendler_name: "Vendor", betrag: 100 },
    ...overrides,
  };
}

describe("POST /api/dokumente/bulk-bezahlt", () => {
  beforeEach(() => {
    mockCheckCsrf.mockReset().mockReturnValue(true);
    mockCreateServerClient.mockReset();
    mockCreateServiceClient.mockReset();
    mockAfter.mockReset();
  });

  it("403 bei CSRF-Fail", async () => {
    mockCheckCsrf.mockReturnValue(false);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [ID_A] }, { origin: "http://evil.com" }));
    expect(res.status).toBe(403);
  });

  it("401 wenn nicht eingeloggt", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(null));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [ID_A] }));
    expect(res.status).toBe(401);
  });

  it("403 für Besteller", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, TEST_PROFIL.besteller_MT));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [ID_A] }));
    expect(res.status).toBe(403);
  });

  it("400 bei leerem ids-Array", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, TEST_PROFIL.buchhaltung));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [] }));
    expect(res.status).toBe(400);
  });

  it("400 bei > 100 ids", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, TEST_PROFIL.buchhaltung));
    const ids = Array.from({ length: 101 }, (_, i) => `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids }));
    expect(res.status).toBe(400);
  });

  it("500 bei DB-Load-Fehler", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, TEST_PROFIL.buchhaltung));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({ loadError: { message: "DB-down" } }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [ID_A] }));
    expect(res.status).toBe(500);
  });

  it("Mixed-Result: marked / already_paid / skipped (not-rechnung, status, not-found)", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, TEST_PROFIL.buchhaltung));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      dokus: [
        makeDoku(ID_A), // gültig → marked
        makeDoku(ID_B, { bezahlt_am: "2026-05-19T10:00:00Z" }), // schon bezahlt → already_paid
        makeDoku(ID_C, { typ: "bestellbestaetigung" }), // kein rechnung → skipped
      ],
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [ID_A, ID_B, ID_C, TEST_UUID.fremd] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.total).toBe(4);
    expect(json.marked).toContain(ID_A);
    expect(json.already_paid).toContain(ID_B);
    expect(json.skipped.some((s: { id: string }) => s.id === ID_C)).toBe(true);
    expect(json.skipped.some((s: { id: string }) => s.id === TEST_UUID.fremd)).toBe(true);
  });

  it("Buchhaltung erlaubt + Admin erlaubt", async () => {
    for (const profil of [TEST_PROFIL.buchhaltung, TEST_PROFIL.admin]) {
      mockCreateServerClient.mockReturnValueOnce(makeAuthClient({ id: "u1" }, profil));
      mockCreateServiceClient.mockReturnValueOnce(makeServiceClient({
        dokus: [makeDoku(ID_A)],
      }));
      const { POST } = await import("../route");
      const res = await POST(makeRequest({ ids: [ID_A] }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.marked).toContain(ID_A);
    }
  });

  it("DATEV-Versand wird via after() registriert (genau 1× für 1 marked)", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, TEST_PROFIL.buchhaltung));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      dokus: [makeDoku(ID_A)],
    }));
    const { POST } = await import("../route");
    await POST(makeRequest({ ids: [ID_A] }));
    expect(mockAfter).toHaveBeenCalledTimes(1);
  });

  it("Status != freigegeben → skipped", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, TEST_PROFIL.buchhaltung));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      dokus: [makeDoku(ID_A, { bestellung: { id: TEST_UUID.bestellung, status: "vollstaendig", bestellnummer: "B1", haendler_name: "T", betrag: 100 } })],
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [ID_A] }));
    const json = await res.json();
    expect(json.marked).toEqual([]);
    expect(json.skipped.some((s: { id: string }) => s.id === ID_A)).toBe(true);
  });
});
