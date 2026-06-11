/**
 * Tests für POST /api/bestellungen/zuordnen.
 *
 * 19.05.2026 (A2.5) — Admin-only Route: Bestellung manuell einem Besteller
 * zuweisen. Plus: XSS-Schutz für Besteller-Name im Audit-Kommentar.
 *
 * 22.05.2026 — Route auf admin+besteller geöffnet (Todo-Page für alle).
 * Audit-Kommentar nutzt jetzt den Actor-Kuerzel/Name statt hardcoded "ADMIN".
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

function makeAuthClient(
  user: { id: string } | null,
  rolle?: "admin" | "besteller" | "buchhaltung",
  opts?: { kuerzel?: string; name?: string },
) {
  // 22.05.2026 — Route liest jetzt rolle+kuerzel+name aus benutzer_rollen,
  // damit der Audit-Kommentar den Actor benennt (nicht hardcoded "ADMIN").
  const single = vi.fn().mockResolvedValue({
    data: rolle
      ? { rolle, kuerzel: opts?.kuerzel ?? "MH", name: opts?.name ?? "Mohammed Hawrami" }
      : null,
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
  /** 11.06.2026 — rolle wird jetzt mit gelesen + geprüft. Default 'besteller'. */
  benutzer?: { name: string; kuerzel: string; rolle?: string } | null;
  bestellung?: { besteller_kuerzel: string; besteller_name: string } | null;
  updateError?: { message: string } | null;
}) {
  const benutzerData = opts.benutzer === undefined
    ? null
    : opts.benutzer === null
      ? null
      : { rolle: "besteller", ...opts.benutzer };
  // benutzer-Query nutzt maybeSingle (kann auch null returnen)
  const benutzerMaybe = vi.fn().mockResolvedValue({ data: benutzerData, error: null });
  // bestellung-Query nutzt weiter single
  const bestellungSingle = vi.fn().mockResolvedValue({ data: opts.bestellung ?? null, error: null });
  let callCount = 0;
  const eq = vi.fn().mockImplementation(() => {
    callCount++;
    return {
      single: callCount === 1 ? benutzerMaybe : bestellungSingle, // Legacy-Fallback
      maybeSingle: benutzerMaybe,
    };
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

  it("200 für Besteller (Todo-Page erlaubt jedem das Claimen)", async () => {
    // 22.05.2026 — vorher 403 (admin-only). Jetzt jeder Besteller darf, weil
    // /todo das Unzugeordnet-Widget für alle Rollen zeigt.
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, "besteller", { kuerzel: "MT", name: "Marlon Tschon" }));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      benutzer: { name: "Marlon Tschon", kuerzel: "MT" },
      bestellung: { besteller_kuerzel: "UNBEKANNT", besteller_name: "Unbekannt" },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, besteller_kuerzel: "MT" }));
    expect(res.status).toBe(200);
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
    // 22.05.2026 — autor_kuerzel ist jetzt der ausführende Admin/Besteller,
    // nicht mehr hardcoded "ADMIN". Mock-Profil hier ist Admin MH.
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, "admin", { kuerzel: "MH", name: "Mohammed Hawrami" }));
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
      autor_kuerzel: "MH",
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

  // 11.06.2026 — Defense-in-Depth: Ziel-Account muss rolle='besteller' sein.
  // Frontend filtert Admin/Buchhaltung schon raus, Backend blockt sie aber
  // server-seitig damit ein manipuliertes Request keine Bestellung an MH
  // (Admin) oder NJ (Buchhaltung) zuweisen kann.
  it("400 wenn Ziel-Account Admin ist", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, "admin", { kuerzel: "MH", name: "MH" }));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      benutzer: { name: "Mohammed Hawrami", kuerzel: "MH", rolle: "admin" },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, besteller_kuerzel: "MH" }));
    expect(res.status).toBe(400);
  });

  it("400 wenn Ziel-Account Buchhaltung ist", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, "admin"));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      benutzer: { name: "Nada Jerinic", kuerzel: "NJ", rolle: "buchhaltung" },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, besteller_kuerzel: "NJ" }));
    expect(res.status).toBe(400);
  });

  it("200 wenn Ziel-Account UNBEKANNT (zurück in Pool/Gemeinschaft)", async () => {
    // UNBEKANNT überspringt den benutzer_rollen-Lookup — gibt es per
    // Definition keinen User-Eintrag dazu.
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, "besteller", { kuerzel: "MT", name: "Marlon" }));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      benutzer: null, // wird gar nicht abgefragt
      bestellung: { besteller_kuerzel: "MT", besteller_name: "Marlon" },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, besteller_kuerzel: "UNBEKANNT" }));
    expect(res.status).toBe(200);
  });

  // Suppress unused-var noise (vitest hoisting)
  it("references TEST_PROFIL to keep import alive", () => {
    expect(TEST_PROFIL.admin.rolle).toBe("admin");
  });
});
