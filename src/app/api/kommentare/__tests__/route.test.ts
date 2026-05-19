/**
 * Tests für POST /api/kommentare.
 *
 * 19.05.2026 (A2.5) — XSS-Sanitization + RLS-Defense-in-Depth: User muss
 * Bestellung sehen können (via RLS-SELECT) bevor er kommentieren darf.
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
vi.mock("@/lib/csrf", () => ({ checkCsrf: () => mockCheckCsrf() }));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => mockCreateClient(),
  createTypedServerSupabaseClient: () => mockCreateClient(),
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

function makeSupabase(opts: {
  sichtbar?: boolean;
  insertError?: { message: string } | null;
}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: opts.sichtbar === false ? null : { id: TEST_UUID.bestellung },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const insert = vi.fn().mockResolvedValue({ data: null, error: opts.insertError ?? null });
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "bestellungen") return { select };
    if (table === "kommentare") return { insert };
    return { select, insert };
  });
  return { from, _insert: insert };
}

describe("POST /api/kommentare", () => {
  beforeEach(() => {
    mockGetProfil.mockReset();
    mockCheckCsrf.mockReset().mockReturnValue(true);
    mockCreateClient.mockReset();
  });

  it("403 bei CSRF-Fail", async () => {
    mockCheckCsrf.mockReturnValue(false);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, text: "Hi" }, { origin: "http://evil.com" }));
    expect(res.status).toBe(403);
  });

  it("401 wenn nicht eingeloggt", async () => {
    mockGetProfil.mockResolvedValue(null);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, text: "Hi" }));
    expect(res.status).toBe(401);
  });

  it("400 ohne bestellung_id", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_MT);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ text: "Hi" }));
    expect(res.status).toBe(400);
  });

  it("400 ohne text (leer / nur whitespace)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_MT);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, text: "   " }));
    expect(res.status).toBe(400);
  });

  it("400 bei invalider bestellung_id", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_MT);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: "not-a-uuid", text: "Hi" }));
    expect(res.status).toBe(400);
  });

  it("400 bei Text > 2000 Zeichen", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_MT);
    const longText = "a".repeat(2001);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, text: longText }));
    expect(res.status).toBe(400);
  });

  it("403 wenn Bestellung via RLS nicht sichtbar (Defense-in-Depth)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_MT);
    mockCreateClient.mockReturnValue(makeSupabase({ sichtbar: false }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, text: "Hi" }));
    expect(res.status).toBe(403);
  });

  it("Happy-Path: 200 + Kommentar persistiert", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_MT);
    const sb = makeSupabase({ sichtbar: true });
    mockCreateClient.mockReturnValue(sb);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, text: "Hi" }));
    expect(res.status).toBe(200);
    expect(sb._insert).toHaveBeenCalledWith(expect.objectContaining({
      bestellung_id: TEST_UUID.bestellung,
      autor_kuerzel: "MT",
      autor_name: "Marlon Tschon",
      text: "Hi",
    }));
  });

  it("XSS wird sanitized (sanitizePlainText)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_MT);
    const sb = makeSupabase({ sichtbar: true });
    mockCreateClient.mockReturnValue(sb);
    const { POST } = await import("../route");
    await POST(makeRequest({
      bestellung_id: TEST_UUID.bestellung,
      text: `<script>alert("xss")</script><img src=x onerror=y>Normal Text`,
    }));
    const insertedText = sb._insert.mock.calls[0]?.[0]?.text as string;
    expect(insertedText).not.toContain("<script>");
    expect(insertedText).not.toContain("onerror");
    expect(insertedText).toContain("Normal Text");
  });

  it("500 bei DB-Insert-Fehler", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_MT);
    mockCreateClient.mockReturnValue(makeSupabase({ sichtbar: true, insertError: { message: "RLS-block" } }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, text: "Hi" }));
    expect(res.status).toBe(500);
  });
});
