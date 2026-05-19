/**
 * Tests für POST /api/bestellungen/verwerfen.
 *
 * 19.05.2026 (A2.5) — Single + Bulk verwerfen. Eigene Auth-Logik (kein
 * requireAuth-Helper) + supabase.auth.getUser + createServiceClient für DELETE.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeRequest, TEST_PROFIL, TEST_UUID } from "@/test-helpers/api-route";

const mockCheckCsrf = vi.fn(() => true);
const mockCreateServerClient = vi.fn();
const mockCreateServiceClient = vi.fn();

vi.mock("@/lib/csrf", () => ({
  checkCsrf: () => mockCheckCsrf(),
}));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => mockCreateServerClient(),
  createTypedServerSupabaseClient: () => mockCreateServerClient(),
}));
vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => mockCreateServiceClient(),
}));
vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

interface VerwerfenBestellung {
  id: string;
  besteller_kuerzel: string;
  bestellungsart: string;
}

/** Auth-Client mock: getUser + benutzer_rollen-SELECT */
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

/** Service-Client mock für die actual Writes */
function makeServiceClient(opts: {
  bestellungen?: VerwerfenBestellung[];
  delError?: { message: string } | null;
  dokumente?: Array<{ email_absender: string; email_betreff: string }>;
}) {
  // bestellungen.SELECT.in()
  const inSelectBest = vi.fn().mockResolvedValue({ data: opts.bestellungen ?? [], error: null });
  // dokumente.SELECT.eq() → for verworfene_emails-learning
  const eqDok = vi.fn().mockResolvedValue({ data: opts.dokumente ?? [], error: null });
  // DELETE chain: delete().in()/eq()/or() → final error
  const deleteEq = vi.fn().mockResolvedValue({ data: null, error: null });
  const deleteIn = vi.fn().mockResolvedValue({ data: null, error: null });
  const deleteOr = vi.fn().mockResolvedValue({ data: null, error: opts.delError ?? null });
  const delChain = {
    eq: () => deleteEq,
    in: () => deleteIn,
    or: () => deleteOr,
  };
  // verworfene_emails.INSERT (no-op in tests)
  const insert = vi.fn().mockResolvedValue({ data: null, error: null });
  // generic from() router
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "bestellungen") {
      // 2 contexts: SELECT für gueltigkeit, DELETE für actual wipe
      return {
        select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: opts.bestellungen ?? [], error: null }) }),
        delete: () => ({
          in: (col: string, vals: string[]) => {
            // Letzter DELETE-Aufruf — returns delError
            return {
              or: () => deleteOr(),
            };
            void col; void vals;
          },
        }),
      };
    }
    if (table === "dokumente") {
      return { select: vi.fn().mockReturnValue({ eq: eqDok }), delete: () => ({ eq: deleteEq }) };
    }
    if (table === "webhook_logs" || table === "freigaben" || table === "abgleiche" || table === "kommentare") {
      return { delete: () => ({ eq: deleteEq }) };
    }
    if (table === "verworfene_emails") {
      return { insert };
    }
    return { select: vi.fn(), insert, delete: () => ({ eq: deleteEq, in: deleteIn, or: deleteOr }) };
  });
  // Backup direkt-accessible für assertions
  return { from, inSelectBest, deleteOr, insertVerworfene: insert };
}

const ID_A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

describe("POST /api/bestellungen/verwerfen", () => {
  beforeEach(() => {
    mockCheckCsrf.mockReset().mockReturnValue(true);
    mockCreateServerClient.mockReset();
    mockCreateServiceClient.mockReset();
  });

  it("403 bei CSRF-Fail", async () => {
    mockCheckCsrf.mockReturnValue(false);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung }, { origin: "http://evil.com" }));
    expect(res.status).toBe(403);
  });

  it("401 wenn nicht eingeloggt", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(null));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung }));
    expect(res.status).toBe(401);
  });

  it("403 für Buchhaltung", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(TEST_PROFIL.buchhaltung));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung }));
    expect(res.status).toBe(403);
  });

  it("400 bei fehlender ID", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(TEST_PROFIL.besteller_MT));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("400 bei > 50 IDs", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(TEST_PROFIL.besteller_MT));
    const ids = Array.from({ length: 51 }, (_, i) => `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_ids: ids }));
    expect(res.status).toBe(400);
  });

  it("403 wenn Besteller fremde Material-Bestellung verwerfen will", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(TEST_PROFIL.besteller_MT));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      bestellungen: [{ id: TEST_UUID.bestellung, besteller_kuerzel: "CR", bestellungsart: "material" }],
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung }));
    expect(res.status).toBe(403);
  });

  it("Besteller darf eigene Material verwerfen", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(TEST_PROFIL.besteller_MT));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      bestellungen: [{ id: TEST_UUID.bestellung, besteller_kuerzel: "MT", bestellungsart: "material" }],
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.deleted).toBe(1);
  });

  it("Besteller darf fremde SU verwerfen (Bypass — Bug-Fix vom 12.05.)", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(TEST_PROFIL.besteller_MT));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      bestellungen: [{ id: TEST_UUID.bestellung, besteller_kuerzel: "UNBEKANNT", bestellungsart: "subunternehmer" }],
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung }));
    expect(res.status).toBe(200);
  });

  it("Besteller darf fremde Abo verwerfen", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(TEST_PROFIL.besteller_MT));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      bestellungen: [{ id: TEST_UUID.bestellung, besteller_kuerzel: "UNBEKANNT", bestellungsart: "abo" }],
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung }));
    expect(res.status).toBe(200);
  });

  it("Admin darf alles verwerfen", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(TEST_PROFIL.admin));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      bestellungen: [{ id: TEST_UUID.bestellung, besteller_kuerzel: "CR", bestellungsart: "material" }],
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung }));
    expect(res.status).toBe(200);
  });

  it("Bulk-Verwerfen: alle eigene → success", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(TEST_PROFIL.besteller_MT));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      bestellungen: [
        { id: ID_A, besteller_kuerzel: "MT", bestellungsart: "material" },
        { id: ID_B, besteller_kuerzel: "MT", bestellungsart: "material" },
      ],
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_ids: [ID_A, ID_B] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe(2);
  });

  it("Bulk mit fremder ID → 403 (Permission-Aborte)", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(TEST_PROFIL.besteller_MT));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      bestellungen: [
        { id: ID_A, besteller_kuerzel: "MT", bestellungsart: "material" },
        { id: ID_B, besteller_kuerzel: "CR", bestellungsart: "material" }, // fremd
      ],
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_ids: [ID_A, ID_B] }));
    expect(res.status).toBe(403);
  });
});
