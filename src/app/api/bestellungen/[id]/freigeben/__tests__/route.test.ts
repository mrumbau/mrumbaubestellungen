/**
 * Tests für POST /api/bestellungen/[id]/freigeben.
 *
 * 19.05.2026 (A2.5) — Erste Route mit Test-Coverage. Test-Pattern wird hier
 * etabliert und in den anderen Top-10-Routes wiederverwendet.
 *
 * Gestern (18.05.) hatten wir live einen 500-Fehler weil eine RLS-Policy nicht
 * aktualisiert war. Solche Bugs sollen ab jetzt in CI gefangen werden statt
 * via Live-Klick im UI.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// vi.mock-Calls werden VOR dem dynamic import des Route-Moduls gehoisted.
// Mock-Funktionen müssen daher via Top-Level deklariert sein.
const mockGetProfil = vi.fn();
const mockCheckCsrf = vi.fn(() => true);
const mockCreateClient = vi.fn();

vi.mock("@/lib/auth", () => ({
  getBenutzerProfil: () => mockGetProfil(),
  // Re-exports die andere Module aus auth importieren
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

const VALID_UUID = "8fc74bd3-0f14-4142-ba24-974c1747d45b";
const FREMD_UUID = "11111111-2222-3333-4444-555555555555";

interface BestellungShape {
  id: string;
  bestellungsart: string;
  besteller_kuerzel: string;
  status: string;
  ist_gutschrift?: boolean;
}

function makeSupabaseFor(opts: {
  bestellung?: BestellungShape | null;
  rpcReturn?: { data: unknown; error: { message: string } | null };
  rpcError?: { message: string } | null;
  kommentarInsertError?: { message: string } | null;
}) {
  const single = vi.fn().mockResolvedValue({ data: opts.bestellung ?? null, error: null });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  const insert = vi.fn().mockResolvedValue({ data: null, error: opts.kommentarInsertError ?? null });
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "bestellungen") return { select };
    if (table === "kommentare") return { insert };
    return { select, insert };
  });
  const rpc = vi.fn().mockResolvedValue({
    data: opts.rpcReturn?.data ?? { success: true, freigabe_id: "new-freigabe-uuid" },
    error: opts.rpcError ?? null,
  });
  return { from, rpc };
}

function makeRequest(body: Record<string, unknown> = {}, originOk = true): NextRequest {
  return new NextRequest("http://localhost:3000/api/bestellungen/test/freigeben", {
    method: "POST",
    headers: originOk
      ? { "content-type": "application/json", origin: "http://localhost:3000" }
      : { "content-type": "application/json", origin: "http://evil.com" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/bestellungen/[id]/freigeben", () => {
  beforeEach(() => {
    mockGetProfil.mockReset();
    mockCheckCsrf.mockReset().mockReturnValue(true);
    mockCreateClient.mockReset();
  });

  it("403 bei CSRF-Fail", async () => {
    mockCheckCsrf.mockReturnValue(false);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({}, false), { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(403);
  });

  it("400 bei invalider UUID", async () => {
    const { POST } = await import("../route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "not-a-uuid" }) });
    expect(res.status).toBe(400);
  });

  it("401 wenn nicht eingeloggt", async () => {
    mockGetProfil.mockResolvedValue(null);
    const { POST } = await import("../route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(401);
  });

  it("403 wenn Buchhaltung versucht freizugeben", async () => {
    mockGetProfil.mockResolvedValue({ kuerzel: "NJ", name: "Nada", rolle: "buchhaltung", user_id: "u1", email: "nj@x" });
    const { POST } = await import("../route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(403);
  });

  it("404 wenn Bestellung nicht existiert", async () => {
    mockGetProfil.mockResolvedValue({ kuerzel: "MT", name: "Marlon", rolle: "besteller", user_id: "u1", email: "mt@x" });
    mockCreateClient.mockReturnValue(makeSupabaseFor({ bestellung: null }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(404);
  });

  it("403 wenn Besteller fremde Material-Bestellung freigeben will", async () => {
    mockGetProfil.mockResolvedValue({ kuerzel: "MT", name: "Marlon", rolle: "besteller", user_id: "u1", email: "mt@x" });
    mockCreateClient.mockReturnValue(makeSupabaseFor({
      bestellung: { id: FREMD_UUID, bestellungsart: "material", besteller_kuerzel: "CR", status: "vollstaendig" },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: FREMD_UUID }) });
    expect(res.status).toBe(403);
  });

  it("Besteller darf fremde SU-Bestellung freigeben (Bypass — Bug-Fix vom 18.05.)", async () => {
    mockGetProfil.mockResolvedValue({ kuerzel: "MT", name: "Marlon", rolle: "besteller", user_id: "u1", email: "mt@x" });
    const sb = makeSupabaseFor({
      bestellung: { id: VALID_UUID, bestellungsart: "subunternehmer", besteller_kuerzel: "UNBEKANNT", status: "vollstaendig" },
    });
    mockCreateClient.mockReturnValue(sb);
    const { POST } = await import("../route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(200);
    // RPC wurde mit MT's kuerzel aufgerufen, nicht UNBEKANNT
    expect(sb.rpc).toHaveBeenCalledWith("freigeben_bestellung", expect.objectContaining({
      p_bestellung_id: VALID_UUID,
      p_kuerzel: "MT",
      p_name: "Marlon",
    }));
  });

  it("Besteller darf fremde Abo-Bestellung freigeben", async () => {
    mockGetProfil.mockResolvedValue({ kuerzel: "MT", name: "Marlon", rolle: "besteller", user_id: "u1", email: "mt@x" });
    mockCreateClient.mockReturnValue(makeSupabaseFor({
      bestellung: { id: VALID_UUID, bestellungsart: "abo", besteller_kuerzel: "UNBEKANNT", status: "vollstaendig" },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(200);
  });

  it("Admin darf jede Bestellung freigeben", async () => {
    mockGetProfil.mockResolvedValue({ kuerzel: "MH", name: "Mohammed", rolle: "admin", user_id: "u1", email: "it@x" });
    mockCreateClient.mockReturnValue(makeSupabaseFor({
      bestellung: { id: VALID_UUID, bestellungsart: "material", besteller_kuerzel: "CR", status: "vollstaendig" },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(200);
  });

  it("409 wenn schon freigegeben (Pre-Check vor RPC)", async () => {
    mockGetProfil.mockResolvedValue({ kuerzel: "MT", name: "Marlon", rolle: "besteller", user_id: "u1", email: "mt@x" });
    mockCreateClient.mockReturnValue(makeSupabaseFor({
      bestellung: { id: VALID_UUID, bestellungsart: "material", besteller_kuerzel: "MT", status: "freigegeben" },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(409);
  });

  it("400 wenn Bestellung Gutschrift ist (eigener Flow)", async () => {
    mockGetProfil.mockResolvedValue({ kuerzel: "MT", name: "Marlon", rolle: "besteller", user_id: "u1", email: "mt@x" });
    mockCreateClient.mockReturnValue(makeSupabaseFor({
      bestellung: { id: VALID_UUID, bestellungsart: "material", besteller_kuerzel: "MT", status: "vollstaendig", ist_gutschrift: true },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(400);
  });

  it("409 wenn RPC 'bereits_freigegeben' liefert (Race-Path)", async () => {
    mockGetProfil.mockResolvedValue({ kuerzel: "MT", name: "Marlon", rolle: "besteller", user_id: "u1", email: "mt@x" });
    mockCreateClient.mockReturnValue(makeSupabaseFor({
      bestellung: { id: VALID_UUID, bestellungsart: "material", besteller_kuerzel: "MT", status: "vollstaendig" },
      rpcReturn: { data: { success: false, error: "bereits_freigegeben" }, error: null },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(409);
  });

  it("500 wenn RPC-Error (DB-Fehler)", async () => {
    mockGetProfil.mockResolvedValue({ kuerzel: "MT", name: "Marlon", rolle: "besteller", user_id: "u1", email: "mt@x" });
    mockCreateClient.mockReturnValue(makeSupabaseFor({
      bestellung: { id: VALID_UUID, bestellungsart: "material", besteller_kuerzel: "MT", status: "vollstaendig" },
      rpcError: { message: "connection refused" },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: VALID_UUID }) });
    expect(res.status).toBe(500);
  });

  it("200 wenn Audit-Kommentar-INSERT scheitert (Freigabe selbst commited — Wurzel-Bug vom 12.05.)", async () => {
    mockGetProfil.mockResolvedValue({ kuerzel: "MT", name: "Marlon", rolle: "besteller", user_id: "u1", email: "mt@x" });
    mockCreateClient.mockReturnValue(makeSupabaseFor({
      bestellung: { id: VALID_UUID, bestellungsart: "material", besteller_kuerzel: "MT", status: "vollstaendig" },
      kommentarInsertError: { message: "RLS-Block" },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: VALID_UUID }) });
    // Freigabe lief durch; Kommentar-Fail wird nur geloggt
    expect(res.status).toBe(200);
  });

  it("Kommentar wird sanitized (XSS-Pattern in body.kommentar)", async () => {
    mockGetProfil.mockResolvedValue({ kuerzel: "MT", name: "Marlon", rolle: "besteller", user_id: "u1", email: "mt@x" });
    const sb = makeSupabaseFor({
      bestellung: { id: VALID_UUID, bestellungsart: "material", besteller_kuerzel: "MT", status: "vollstaendig" },
    });
    mockCreateClient.mockReturnValue(sb);
    const { POST } = await import("../route");
    await POST(
      makeRequest({ kommentar: `<script>alert("xss")</script>Test` }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
    // Erwartet: HTML-Sonderzeichen wurden im auditText entfernt
    const kommentareCalls = sb.from.mock.results
      .filter((r) => r.value.insert) // nur kommentare-Aufrufe haben insert
      .map((r) => r.value.insert.mock.calls);
    const insertedText = kommentareCalls.flat().flat()[0]?.text;
    expect(insertedText).not.toContain("<script>");
    expect(insertedText).not.toContain('"');
  });
});
