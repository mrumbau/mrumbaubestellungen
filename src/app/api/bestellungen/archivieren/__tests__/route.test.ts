/**
 * Tests für POST /api/bestellungen/archivieren.
 *
 * 19.05.2026 (A2.5) — Archivieren bezahlter Rechnungen (Bulk). Filter:
 * nur freigegebene UND bezahlte Bestellungen werden tatsächlich archiviert,
 * andere IDs werden stillschweigend ignoriert.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeRequest, TEST_PROFIL, TEST_UUID } from "@/test-helpers/api-route";

const mockCheckCsrf = vi.fn(() => true);
const mockCreateServerClient = vi.fn();
const mockCreateServiceClient = vi.fn();

vi.mock("@/lib/csrf", () => ({ checkCsrf: () => mockCheckCsrf() }));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => mockCreateServerClient(),
  createTypedServerSupabaseClient: () => mockCreateServerClient(),
}));
vi.mock("@/lib/supabase", () => ({ createServiceClient: () => mockCreateServiceClient() }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

function makeAuthClient(profil: typeof TEST_PROFIL.besteller_MT | null) {
  const single = vi.fn().mockResolvedValue({ data: profil, error: null });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: profil ? { id: profil.user_id } : null }, error: null }) },
    from,
  };
}

function makeServiceClient(opts: {
  gueltige?: Array<{ id: string }>;
  updateError?: { message: string } | null;
}) {
  // Chain: from("bestellungen").select().in().eq().not() → { data: gueltige }
  // Chain: from("bestellungen").update({...}).in() → { error: updateError }
  const notFn = vi.fn().mockResolvedValue({ data: opts.gueltige ?? [], error: null });
  const eqSelect = vi.fn().mockReturnValue({ not: notFn });
  const inSelect = vi.fn().mockReturnValue({ eq: eqSelect });
  const select = vi.fn().mockReturnValue({ in: inSelect });
  const inUpdate = vi.fn().mockResolvedValue({ data: null, error: opts.updateError ?? null });
  const update = vi.fn().mockReturnValue({ in: inUpdate });
  const from = vi.fn().mockReturnValue({ select, update });
  return { from, _notFn: notFn, _inUpdate: inUpdate };
}

const ID_A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

describe("POST /api/bestellungen/archivieren", () => {
  beforeEach(() => {
    mockCheckCsrf.mockReset().mockReturnValue(true);
    mockCreateServerClient.mockReset();
    mockCreateServiceClient.mockReset();
  });

  it("403 bei CSRF-Fail", async () => {
    mockCheckCsrf.mockReturnValue(false);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [TEST_UUID.bestellung] }, { origin: "http://evil.com" }));
    expect(res.status).toBe(403);
  });

  it("400 bei leerem Array", async () => {
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [] }));
    expect(res.status).toBe(400);
  });

  it("400 bei > 100 IDs", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids }));
    expect(res.status).toBe(400);
  });

  it("400 bei nicht-UUID", async () => {
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: ["not-a-uuid"] }));
    expect(res.status).toBe(400);
  });

  it("401 wenn nicht eingeloggt", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(null));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [TEST_UUID.bestellung] }));
    expect(res.status).toBe(401);
  });

  it("Alle Rollen dürfen archivieren (besteller + buchhaltung + admin)", async () => {
    const profile = [TEST_PROFIL.besteller_MT, TEST_PROFIL.buchhaltung, TEST_PROFIL.admin];
    for (const p of profile) {
      mockCreateServerClient.mockReturnValueOnce(makeAuthClient(p));
      mockCreateServiceClient.mockReturnValueOnce(makeServiceClient({
        gueltige: [{ id: TEST_UUID.bestellung }],
      }));
      const { POST } = await import("../route");
      const res = await POST(makeRequest({ ids: [TEST_UUID.bestellung] }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.archiviert).toBe(1);
      expect(json.archiviert_von).toBe(p.name);
    }
  });

  it("400 wenn keine der IDs gültig (nicht freigegeben oder nicht bezahlt)", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(TEST_PROFIL.besteller_MT));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      gueltige: [], // SELECT-Filter returnt leer → keine gültigen bezahlten freigegebenen
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [TEST_UUID.bestellung] }));
    expect(res.status).toBe(400);
  });

  it("Teil-Bulk: nur 1 von 2 IDs ist bezahlt+freigegeben → archiviert 1", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(TEST_PROFIL.besteller_MT));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      gueltige: [{ id: ID_A }], // nur A gültig
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [ID_A, ID_B] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.archiviert).toBe(1);
  });

  it("500 bei DB-Update-Fehler", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(TEST_PROFIL.besteller_MT));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      gueltige: [{ id: TEST_UUID.bestellung }],
      updateError: { message: "connection refused" },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [TEST_UUID.bestellung] }));
    expect(res.status).toBe(500);
  });
});
