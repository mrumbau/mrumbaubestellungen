/**
 * Tests für POST /api/bestellungen/zuordnen.
 *
 * 19.05.2026 (A2.5) — Admin-only Route: Bestellung manuell einem Besteller
 * zuweisen. Plus: XSS-Schutz für Besteller-Name im Audit-Kommentar.
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

function makeAuthClient(user: { id: string } | null, rolle?: "admin" | "besteller" | "buchhaltung") {
  const single = vi.fn().mockResolvedValue({
    data: rolle ? { rolle } : null,
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from: vi.fn().mockReturnValue({ select }),
  };
}

function makeServiceClient(opts: {
  benutzer?: { name: string; kuerzel: string } | null;
  bestellung?: { besteller_kuerzel: string; besteller_name: string } | null;
  updateError?: { message: string } | null;
}) {
  const benutzerSingle = vi.fn().mockResolvedValue({ data: opts.benutzer ?? null, error: null });
  const bestellungSingle = vi.fn().mockResolvedValue({ data: opts.bestellung ?? null, error: null });
  let selectCount = 0;
  const eq = vi.fn().mockImplementation(() => {
    selectCount++;
    return { single: selectCount === 1 ? benutzerSingle : bestellungSingle };
  });
  const select = vi.fn().mockReturnValue({ eq });
  const insert = vi.fn().mockResolvedValue({ data: null, error: null });
  const eqUpdate = vi.fn().mockResolvedValue({ data: null, error: opts.updateError ?? null });
  const update = vi.fn().mockReturnValue({ eq: eqUpdate });
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "benutzer_rollen" || table === "bestellungen") return { select, update };
    if (table === "kommentare") return { insert };
    return { select, update, insert };
  });
  return { from, _insert: insert };
}

describe("POST /api/bestellungen/zuordnen", () => {
  beforeEach(() => {
    mockCheckCsrf.mockReset().mockReturnValue(true);
    mockCreateServerClient.mockReset();
    mockCreateServiceClient.mockReset();
  });

  it("403 bei CSRF-Fail", async () => {
    mockCheckCsrf.mockReturnValue(false);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({}, { origin: "http://evil.com" }));
    expect(res.status).toBe(403);
  });

  it("401 wenn nicht eingeloggt", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(null));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, besteller_kuerzel: "MT" }));
    expect(res.status).toBe(401);
  });

  it("403 für Besteller (nur Admin erlaubt)", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, "besteller"));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, besteller_kuerzel: "MT" }));
    expect(res.status).toBe(403);
  });

  it("403 für Buchhaltung", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, "buchhaltung"));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, besteller_kuerzel: "MT" }));
    expect(res.status).toBe(403);
  });

  it("400 bei invalider Bestellung-ID", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, "admin"));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: "not-uuid", besteller_kuerzel: "MT" }));
    expect(res.status).toBe(400);
  });

  it("400 bei invalidem Kürzel", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, "admin"));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, besteller_kuerzel: "this-is-invalid-because-too-long-and-has-dashes" }));
    expect(res.status).toBe(400);
  });

  it("404 wenn Besteller-Kürzel nicht existiert", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, "admin"));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({ benutzer: null }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, besteller_kuerzel: "XX" }));
    expect(res.status).toBe(404);
  });

  it("Happy-Path: 200 + Bestellung aktualisiert + Audit-Kommentar", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, "admin"));
    const sb = makeServiceClient({
      benutzer: { name: "Marlon Tschon", kuerzel: "MT" },
      bestellung: { besteller_kuerzel: "UNBEKANNT", besteller_name: "Unbekannt" },
    });
    mockCreateServiceClient.mockReturnValue(sb);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, besteller_kuerzel: "MT" }));
    expect(res.status).toBe(200);
    expect(sb._insert).toHaveBeenCalledWith(expect.objectContaining({
      bestellung_id: TEST_UUID.bestellung,
      autor_kuerzel: "ADMIN",
      text: expect.stringContaining("UNBEKANNT → MT"),
    }));
  });

  it("500 bei DB-Update-Fehler", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, "admin"));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      benutzer: { name: "Marlon", kuerzel: "MT" },
      bestellung: { besteller_kuerzel: "UNBEKANNT", besteller_name: "X" },
      updateError: { message: "DB-fail" },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, besteller_kuerzel: "MT" }));
    expect(res.status).toBe(500);
  });

  it("XSS im Besteller-Name wird im Audit-Kommentar sanitized", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, "admin"));
    const sb = makeServiceClient({
      benutzer: { name: `<script>alert("xss")</script>Marlon`, kuerzel: "MT" },
      bestellung: { besteller_kuerzel: "UNBEKANNT", besteller_name: "X" },
    });
    mockCreateServiceClient.mockReturnValue(sb);
    const { POST } = await import("../route");
    await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, besteller_kuerzel: "MT" }));
    const text = sb._insert.mock.calls[0]?.[0]?.text as string;
    expect(text).not.toContain("<script>");
    expect(text).not.toContain('"');
  });

  // Suppress unused-var noise (vitest hoisting)
  it("references TEST_PROFIL to keep import alive", () => {
    expect(TEST_PROFIL.admin.rolle).toBe("admin");
  });
});
