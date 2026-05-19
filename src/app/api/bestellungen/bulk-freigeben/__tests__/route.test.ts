/**
 * Tests für POST /api/bestellungen/bulk-freigeben.
 *
 * 19.05.2026 (A2.5) — Mixed-Result-Pattern: pro ID Klassifikation in
 * freigegeben / already_freigegeben / no_rechnung / no_permission / not_found / errors.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeRequest, TEST_PROFIL, TEST_UUID } from "@/test-helpers/api-route";

const mockGetProfil = vi.fn();
const mockCheckCsrf = vi.fn(() => true);
const mockCreateClient = vi.fn();

vi.mock("@/lib/auth", () => ({
  getBenutzerProfil: () => mockGetProfil(),
  requireRoles: () => true,
}));
vi.mock("@/lib/csrf", () => ({
  checkCsrf: () => mockCheckCsrf(),
}));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => mockCreateClient(),
  createTypedServerSupabaseClient: () => mockCreateClient(),
}));
vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

interface BulkBestellung {
  id: string;
  status: string;
  besteller_kuerzel: string;
  bestellungsart: string;
  hat_rechnung: boolean;
  ist_gutschrift?: boolean;
}

function makeSupabase(opts: {
  bestellungen?: BulkBestellung[];
  loadError?: { message: string } | null;
  rpcReturn?: { data: unknown; error: { message: string } | null };
  rpcError?: { message: string } | null;
}) {
  const inFn = vi.fn().mockResolvedValue({
    data: opts.bestellungen ?? [],
    error: opts.loadError ?? null,
  });
  const select = vi.fn().mockReturnValue({ in: inFn });
  const insert = vi.fn().mockResolvedValue({ data: null, error: null });
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "bestellungen") return { select };
    if (table === "kommentare") return { insert };
    return { select, insert };
  });
  const rpc = vi.fn().mockResolvedValue({
    data: opts.rpcReturn?.data ?? { success: true, freigabe_id: "new-uuid" },
    error: opts.rpcError ?? null,
  });
  return { from, rpc };
}

// Valid UUID-v4. WICHTIG: 4. Block muss mit 8/9/a/b starten (Variant-Bit),
// 3. Block mit 1-8 (Version). c/d/e/f als 1. char vom 4. Block werden von
// Zod's strict-uuid abgelehnt.
const ID_A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const ID_C = "cccccccc-cccc-4ccc-accc-cccccccccccc";
const ID_D = "dddddddd-dddd-4ddd-addd-dddddddddddd";

describe("POST /api/bestellungen/bulk-freigeben", () => {
  beforeEach(() => {
    mockGetProfil.mockReset();
    mockCheckCsrf.mockReset().mockReturnValue(true);
    mockCreateClient.mockReset();
  });

  it("403 bei CSRF-Fail", async () => {
    mockCheckCsrf.mockReturnValue(false);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [TEST_UUID.bestellung] }, { origin: "http://evil.com" }));
    expect(res.status).toBe(403);
  });

  it("401 wenn nicht eingeloggt", async () => {
    mockGetProfil.mockResolvedValue(null);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [TEST_UUID.bestellung] }));
    expect(res.status).toBe(401);
  });

  it("403 für Buchhaltung", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.buchhaltung);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [TEST_UUID.bestellung] }));
    expect(res.status).toBe(403);
  });

  it("400 bei leerem ids-Array (Zod-Min-1)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_MT);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [] }));
    expect(res.status).toBe(400);
  });

  it("400 bei nicht-UUID ids (Zod)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_MT);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: ["not-a-uuid"] }));
    expect(res.status).toBe(400);
  });

  it("400 bei > 100 ids (Zod-Max)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_MT);
    const longIds = Array.from({ length: 101 }, (_, i) =>
      `${String(i).padStart(8, "0")}-0000-0000-0000-000000000000`);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: longIds }));
    expect(res.status).toBe(400);
  });

  it("Mixed-Result: not_found / no_permission / already / gutschrift / no_rechnung / freigegeben", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_MT);
    mockCreateClient.mockReturnValue(makeSupabase({
      bestellungen: [
        // ID_A: not-found (nicht in DB-Map)
        // ID_B: fremde Material-Bestellung → no_permission
        { id: ID_B, status: "vollstaendig", besteller_kuerzel: "CR", bestellungsart: "material", hat_rechnung: true },
        // ID_C: schon freigegeben
        { id: ID_C, status: "freigegeben", besteller_kuerzel: "MT", bestellungsart: "material", hat_rechnung: true },
        // ID_D: kein hat_rechnung
        { id: ID_D, status: "vollstaendig", besteller_kuerzel: "MT", bestellungsart: "material", hat_rechnung: false },
        // TEST_UUID.bestellung: gültig + Material + MT → freigegeben
        { id: TEST_UUID.bestellung, status: "vollstaendig", besteller_kuerzel: "MT", bestellungsart: "material", hat_rechnung: true },
        // TEST_UUID.bestellung_2: Gutschrift → already_freigegeben (semantisch skip)
        { id: TEST_UUID.bestellung_2, status: "vollstaendig", besteller_kuerzel: "MT", bestellungsart: "material", hat_rechnung: true, ist_gutschrift: true },
      ],
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({
      ids: [ID_A, ID_B, ID_C, ID_D, TEST_UUID.bestellung, TEST_UUID.bestellung_2],
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.total).toBe(6);
    expect(json.not_found).toEqual([ID_A]);
    expect(json.no_permission).toEqual([ID_B]);
    expect(json.already_freigegeben).toEqual(expect.arrayContaining([ID_C, TEST_UUID.bestellung_2]));
    expect(json.no_rechnung).toEqual([ID_D]);
    expect(json.freigegeben).toEqual([TEST_UUID.bestellung]);
    expect(json.errors).toEqual([]);
  });

  it("SU/Abo-Bestellung: jeder Besteller darf freigeben (Bypass)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_MT);
    const sb = makeSupabase({
      bestellungen: [
        { id: ID_A, status: "vollstaendig", besteller_kuerzel: "UNBEKANNT", bestellungsart: "subunternehmer", hat_rechnung: true },
        { id: ID_B, status: "vollstaendig", besteller_kuerzel: "UNBEKANNT", bestellungsart: "abo", hat_rechnung: true },
      ],
    });
    mockCreateClient.mockReturnValue(sb);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [ID_A, ID_B] }));
    const json = await res.json();
    expect(json.freigegeben).toEqual([ID_A, ID_B]);
    expect(sb.rpc).toHaveBeenCalledTimes(2);
  });

  it("Admin darf alle freigeben (auch fremde)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    mockCreateClient.mockReturnValue(makeSupabase({
      bestellungen: [
        { id: ID_A, status: "vollstaendig", besteller_kuerzel: "CR", bestellungsart: "material", hat_rechnung: true },
        { id: ID_B, status: "vollstaendig", besteller_kuerzel: "MT", bestellungsart: "material", hat_rechnung: true },
      ],
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [ID_A, ID_B] }));
    const json = await res.json();
    expect(json.freigegeben).toEqual([ID_A, ID_B]);
    expect(json.no_permission).toEqual([]);
  });

  it("RPC-Fehler pro ID landet in errors (andere IDs laufen durch)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_MT);
    // Erste RPC schlägt fehl, zweite läuft durch
    const sb = makeSupabase({
      bestellungen: [
        { id: ID_A, status: "vollstaendig", besteller_kuerzel: "MT", bestellungsart: "material", hat_rechnung: true },
        { id: ID_B, status: "vollstaendig", besteller_kuerzel: "MT", bestellungsart: "material", hat_rechnung: true },
      ],
    });
    let rpcCallCount = 0;
    sb.rpc = vi.fn().mockImplementation(async () => {
      rpcCallCount++;
      if (rpcCallCount === 1) return { data: null, error: { message: "DB-Fehler" } };
      return { data: { success: true, freigabe_id: "uuid" }, error: null };
    });
    mockCreateClient.mockReturnValue(sb);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [ID_A, ID_B] }));
    const json = await res.json();
    expect(json.errors.length).toBe(1);
    expect(json.errors[0]).toMatchObject({ id: ID_A, reason: "DB-Fehler" });
    expect(json.freigegeben).toEqual([ID_B]);
  });

  it("500 bei DB-Load-Fehler (kein Mixed-Result möglich)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_MT);
    mockCreateClient.mockReturnValue(makeSupabase({
      loadError: { message: "connection refused" },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [TEST_UUID.bestellung] }));
    expect(res.status).toBe(500);
  });

  it("Audit-Kommentar-Fail bricht NICHT die Bulk-Loop ab", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_MT);
    const sb = makeSupabase({
      bestellungen: [
        { id: ID_A, status: "vollstaendig", besteller_kuerzel: "MT", bestellungsart: "material", hat_rechnung: true },
        { id: ID_B, status: "vollstaendig", besteller_kuerzel: "MT", bestellungsart: "material", hat_rechnung: true },
      ],
    });
    // kommentare-INSERT scheitert immer
    const insertFail = vi.fn().mockResolvedValue({ data: null, error: { message: "RLS-Block" } });
    sb.from = vi.fn().mockImplementation((table: string) => {
      if (table === "bestellungen") return { select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [
        { id: ID_A, status: "vollstaendig", besteller_kuerzel: "MT", bestellungsart: "material", hat_rechnung: true },
        { id: ID_B, status: "vollstaendig", besteller_kuerzel: "MT", bestellungsart: "material", hat_rechnung: true },
      ], error: null }) }) };
      if (table === "kommentare") return { insert: insertFail };
      return {};
    });
    mockCreateClient.mockReturnValue(sb);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [ID_A, ID_B] }));
    const json = await res.json();
    // Beide Freigaben sind durchgelaufen trotz Kommentar-Fail
    expect(json.freigegeben).toEqual([ID_A, ID_B]);
    expect(json.errors).toEqual([]);
  });

  it("Kommentar wird sanitized (XSS)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_MT);
    const sb = makeSupabase({
      bestellungen: [
        { id: ID_A, status: "vollstaendig", besteller_kuerzel: "MT", bestellungsart: "material", hat_rechnung: true },
      ],
    });
    mockCreateClient.mockReturnValue(sb);
    const { POST } = await import("../route");
    await POST(makeRequest({ ids: [ID_A], kommentar: `<script>alert("xss")</script>Notiz` }));
    // RPC erhält sanitized kommentar
    expect(sb.rpc).toHaveBeenCalledWith("freigeben_bestellung", expect.objectContaining({
      p_kommentar: expect.not.stringContaining("<script>"),
    }));
  });
});
