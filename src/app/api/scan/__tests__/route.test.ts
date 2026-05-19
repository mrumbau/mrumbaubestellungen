/**
 * Tests für POST /api/scan.
 *
 * 19.05.2026 (A2.5) — Fokus auf Pre-Validation: CSRF, Rate-Limit, Auth,
 * Input-Sanity, MIME, File-Size. Die OpenAI-Pipeline + Storage-Upload selbst
 * wird NICHT getestet (würde echte API-Calls auslösen) — diese landen in
 * Integration-Tests sobald Test-Container existieren.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeRequest, TEST_UUID } from "@/test-helpers/api-route";

const mockCheckCsrf = vi.fn(() => true);
const mockCheckRateLimit = vi.fn(() => ({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 }));
const mockCreateServerClient = vi.fn();
const mockCreateServiceClient = vi.fn();
const mockAnalyse = vi.fn();

vi.mock("@/lib/csrf", () => ({ checkCsrf: () => mockCheckCsrf() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => mockCheckRateLimit(),
  getRateLimitKey: () => "test-key",
}));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => mockCreateServerClient(),
  createTypedServerSupabaseClient: () => mockCreateServerClient(),
}));
vi.mock("@/lib/supabase", () => ({ createServiceClient: () => mockCreateServiceClient() }));
vi.mock("@/lib/openai", () => ({
  analysiereDokument: (...args: unknown[]) => mockAnalyse(...args),
  fuehreAbgleichDurch: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));
vi.mock("@/lib/bestellung-utils", () => ({ updateBestellungStatus: vi.fn() }));

function makeAuthClient(user: { id: string } | null, profil?: { kuerzel: string; rolle: string }) {
  const single = vi.fn().mockResolvedValue({ data: profil ?? null, error: null });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from,
  };
}

const TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";

describe("POST /api/scan", () => {
  beforeEach(() => {
    mockCheckCsrf.mockReset().mockReturnValue(true);
    mockCheckRateLimit.mockReset().mockReturnValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60_000 });
    mockCreateServerClient.mockReset();
    mockCreateServiceClient.mockReset();
    mockAnalyse.mockReset();
  });

  it("403 bei CSRF-Fail", async () => {
    mockCheckCsrf.mockReturnValue(false);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({}, { origin: "http://evil.com" }));
    expect(res.status).toBe(403);
  });

  it("429 bei Rate-Limit erschöpft", async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, base64: TINY_PNG_BASE64, mime_type: "image/png" }));
    expect(res.status).toBe(429);
  });

  it("401 wenn nicht eingeloggt", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(null));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, base64: TINY_PNG_BASE64, mime_type: "image/png" }));
    expect(res.status).toBe(401);
  });

  it("400 ohne bestellung_id / base64 / mime_type", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, { kuerzel: "MT", rolle: "besteller" }));
    const { POST } = await import("../route");

    let res = await POST(makeRequest({ base64: TINY_PNG_BASE64, mime_type: "image/png" }));
    expect(res.status).toBe(400);

    res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, mime_type: "image/png" }));
    expect(res.status).toBe(400);

    res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, base64: TINY_PNG_BASE64 }));
    expect(res.status).toBe(400);
  });

  it("400 bei invalider bestellung_id", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, { kuerzel: "MT", rolle: "besteller" }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: "not-a-uuid", base64: TINY_PNG_BASE64, mime_type: "image/png" }));
    expect(res.status).toBe(400);
  });

  it("400 bei ungültigem MIME-Type", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, { kuerzel: "MT", rolle: "besteller" }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, base64: TINY_PNG_BASE64, mime_type: "application/x-exe" }));
    expect(res.status).toBe(400);
  });

  it("413 bei zu großer Datei (> 4MB base64)", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, { kuerzel: "MT", rolle: "besteller" }));
    // > 6 MB base64 → über 4MB-Limit
    const hugeBase64 = "a".repeat(7 * 1024 * 1024);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, base64: hugeBase64, mime_type: "image/png" }));
    expect(res.status).toBe(413);
  });

  it("403 wenn kein Profil zum User existiert", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, undefined));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: TEST_UUID.bestellung, base64: TINY_PNG_BASE64, mime_type: "image/png" }));
    expect(res.status).toBe(403);
  });
});
