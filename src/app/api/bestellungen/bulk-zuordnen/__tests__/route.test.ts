/**
 * Tests für POST /api/bestellungen/bulk-zuordnen (09.06.2026).
 *
 * Bulk-Variante des Owner-Wechsels. Pro ID:
 *   - laden, idempotent skip wenn schon Ziel
 *   - UPDATE auf besteller_kuerzel/name
 *   - kommentare-Insert für Audit
 * Strukturiertes Response mit updated/was_already_correct/errors/no_permission.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { TEST_PROFIL } from "@/test-helpers/api-route";

const mockCheckCsrf = vi.fn(() => true);
const mockRequireAuth = vi.fn();
const mockCreateServiceClient = vi.fn();

vi.mock("@/lib/csrf", () => ({
  checkCsrf: () => mockCheckCsrf(),
}));
vi.mock("@/lib/require-auth", () => ({
  requireAuth: () => mockRequireAuth(),
}));
vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => mockCreateServiceClient(),
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

function makeRequest(body: Record<string, unknown> = {}, opts: { origin?: string } = {}) {
  return new NextRequest("http://localhost:3000/api/bestellungen/bulk-zuordnen", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: opts.origin ?? "http://localhost:3000",
    },
    body: JSON.stringify(body),
  });
}

interface BestRow {
  id: string;
  besteller_kuerzel: string | null;
  besteller_name: string | null;
  bestellungsart: string | null;
  status: string | null;
}

interface ServiceOpts {
  bestellungen?: Map<string, BestRow>;
  zielBenutzer?: { kuerzel: string; name: string; rolle: string } | null;
  updateErrors?: Map<string, string>;
  loadErrors?: Map<string, string>;
}

function makeServiceClient(opts: ServiceOpts = {}) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const inserts: Array<Record<string, unknown>> = [];
  const bestellungen = opts.bestellungen ?? new Map();

  const from = vi.fn((table: string) => {
    if (table === "benutzer_rollen") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: opts.zielBenutzer ?? null, error: null }),
          }),
        }),
      };
    }
    if (table === "bestellungen") {
      return {
        select: () => ({
          eq: (_col: string, val: string) => ({
            maybeSingle: () => {
              const err = opts.loadErrors?.get(val);
              if (err) return Promise.resolve({ data: null, error: { message: err } });
              return Promise.resolve({ data: bestellungen.get(val) ?? null, error: null });
            },
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: (_col: string, val: string) => {
            const err = opts.updateErrors?.get(val);
            if (err) return Promise.resolve({ data: null, error: { message: err } });
            updates.push({ id: val, patch });
            return Promise.resolve({ data: null, error: null });
          },
        }),
      };
    }
    if (table === "kommentare") {
      return {
        insert: (row: Record<string, unknown>) => {
          inserts.push(row);
          return Promise.resolve({ data: row, error: null });
        },
      };
    }
    return { select: vi.fn(), update: vi.fn(), insert: vi.fn() };
  });
  return { from, updates, inserts };
}

function profilAuth(profil: typeof TEST_PROFIL.admin) {
  return { response: null, profil };
}

const ID_A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
// 4. Block muss mit 8/9/a/b starten (UUID-v4-Variant) — kein „cccc" daher das „c"-ID-Pattern explizit anpassen.
const ID_C = "cccccccc-cccc-4ccc-accc-cccccccccccc";

describe("POST /api/bestellungen/bulk-zuordnen", () => {
  beforeEach(() => {
    mockCheckCsrf.mockReset().mockReturnValue(true);
    mockRequireAuth.mockReset();
    mockCreateServiceClient.mockReset();
  });

  it("403 bei CSRF-Fail", async () => {
    mockCheckCsrf.mockReturnValue(false);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [ID_A], besteller_kuerzel: "MT" }));
    expect(res.status).toBe(403);
  });

  it("403 für Buchhaltung", async () => {
    mockRequireAuth.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "x" }), { status: 403 }),
    });
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [ID_A], besteller_kuerzel: "MT" }));
    expect(res.status).toBe(403);
  });

  it("400 bei leerem ids-Array", async () => {
    mockRequireAuth.mockResolvedValue(profilAuth(TEST_PROFIL.admin));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [], besteller_kuerzel: "MT" }));
    expect(res.status).toBe(400);
  });

  it("400 bei > 100 IDs", async () => {
    mockRequireAuth.mockResolvedValue(profilAuth(TEST_PROFIL.admin));
    const ids = Array.from(
      { length: 101 },
      (_, i) => `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`,
    );
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids, besteller_kuerzel: "MT" }));
    expect(res.status).toBe(400);
  });

  it("400 bei fehlendem besteller_kuerzel", async () => {
    mockRequireAuth.mockResolvedValue(profilAuth(TEST_PROFIL.admin));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [ID_A] }));
    expect(res.status).toBe(400);
  });

  it("404 wenn Ziel-Besteller nicht existiert", async () => {
    mockRequireAuth.mockResolvedValue(profilAuth(TEST_PROFIL.admin));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({ zielBenutzer: null }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [ID_A], besteller_kuerzel: "XY" }));
    expect(res.status).toBe(404);
  });

  it("400 wenn Ziel-Account Admin/Buchhaltung ist", async () => {
    mockRequireAuth.mockResolvedValue(profilAuth(TEST_PROFIL.admin));
    mockCreateServiceClient.mockReturnValue(
      makeServiceClient({
        zielBenutzer: { kuerzel: "MH", name: "Mohammed", rolle: "admin" },
      }),
    );
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [ID_A], besteller_kuerzel: "MH" }));
    expect(res.status).toBe(400);
  });

  it("Happy-Path: 2 IDs → beide updated", async () => {
    mockRequireAuth.mockResolvedValue(profilAuth(TEST_PROFIL.admin));
    const bestellungen = new Map<string, BestRow>([
      [ID_A, { id: ID_A, besteller_kuerzel: "UNBEKANNT", besteller_name: "Pool", bestellungsart: "material", status: "offen" }],
      [ID_B, { id: ID_B, besteller_kuerzel: "CR", besteller_name: "Carsten", bestellungsart: "material", status: "offen" }],
    ]);
    const service = makeServiceClient({
      bestellungen,
      zielBenutzer: { kuerzel: "MT", name: "Marlon", rolle: "besteller" },
    });
    mockCreateServiceClient.mockReturnValue(service);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [ID_A, ID_B], besteller_kuerzel: "MT" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.updated).toEqual([ID_A, ID_B]);
    expect(json.was_already_correct).toEqual([]);
    expect(json.errors).toEqual([]);
    expect(service.updates).toHaveLength(2);
    expect(service.updates[0].patch.besteller_kuerzel).toBe("MT");
    expect(service.inserts).toHaveLength(2); // Audit-Kommentare
  });

  it("Idempotenz: ID schon dem Ziel zugeordnet → was_already_correct", async () => {
    mockRequireAuth.mockResolvedValue(profilAuth(TEST_PROFIL.admin));
    const bestellungen = new Map<string, BestRow>([
      [ID_A, { id: ID_A, besteller_kuerzel: "MT", besteller_name: "Marlon", bestellungsart: "material", status: "offen" }],
      [ID_B, { id: ID_B, besteller_kuerzel: "CR", besteller_name: "Carsten", bestellungsart: "material", status: "offen" }],
    ]);
    const service = makeServiceClient({
      bestellungen,
      zielBenutzer: { kuerzel: "MT", name: "Marlon", rolle: "besteller" },
    });
    mockCreateServiceClient.mockReturnValue(service);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [ID_A, ID_B], besteller_kuerzel: "MT" }));
    const json = await res.json();
    expect(json.updated).toEqual([ID_B]);
    expect(json.was_already_correct).toEqual([ID_A]);
    expect(service.updates).toHaveLength(1); // nur ID_B
  });

  it("Partial-Failure: 1 Bestellung nicht gefunden", async () => {
    mockRequireAuth.mockResolvedValue(profilAuth(TEST_PROFIL.admin));
    const bestellungen = new Map<string, BestRow>([
      [ID_A, { id: ID_A, besteller_kuerzel: "CR", besteller_name: "Carsten", bestellungsart: "material", status: "offen" }],
      // ID_B fehlt
    ]);
    const service = makeServiceClient({
      bestellungen,
      zielBenutzer: { kuerzel: "MT", name: "Marlon", rolle: "besteller" },
    });
    mockCreateServiceClient.mockReturnValue(service);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [ID_A, ID_B], besteller_kuerzel: "MT" }));
    const json = await res.json();
    expect(json.updated).toEqual([ID_A]);
    expect(json.errors).toHaveLength(1);
    expect(json.errors[0].id).toBe(ID_B);
    expect(json.errors[0].reason).toContain("nicht gefunden");
  });

  it("Gemeinschaft: besteller_kuerzel='UNBEKANNT' überspringt benutzer-Check", async () => {
    mockRequireAuth.mockResolvedValue(profilAuth(TEST_PROFIL.besteller_MT));
    const bestellungen = new Map<string, BestRow>([
      [ID_A, { id: ID_A, besteller_kuerzel: "MT", besteller_name: "Marlon", bestellungsart: "material", status: "offen" }],
    ]);
    const service = makeServiceClient({
      bestellungen,
      // Wichtig: kein zielBenutzer nötig — UNBEKANNT-Pfad skipt das
    });
    mockCreateServiceClient.mockReturnValue(service);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [ID_A], besteller_kuerzel: "UNBEKANNT" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.updated).toEqual([ID_A]);
    expect(service.updates[0].patch.besteller_kuerzel).toBe("UNBEKANNT");
    expect(service.updates[0].patch.besteller_name).toBe("Gemeinschaft");
  });

  it("Bulk-Mix: 1 updated + 1 already + 1 error → strukturiertes Result", async () => {
    mockRequireAuth.mockResolvedValue(profilAuth(TEST_PROFIL.admin));
    const bestellungen = new Map<string, BestRow>([
      [ID_A, { id: ID_A, besteller_kuerzel: "CR", besteller_name: "Carsten", bestellungsart: "material", status: "offen" }],
      [ID_B, { id: ID_B, besteller_kuerzel: "MT", besteller_name: "Marlon", bestellungsart: "material", status: "offen" }],
      // ID_C fehlt
    ]);
    const service = makeServiceClient({
      bestellungen,
      zielBenutzer: { kuerzel: "MT", name: "Marlon", rolle: "besteller" },
    });
    mockCreateServiceClient.mockReturnValue(service);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ ids: [ID_A, ID_B, ID_C], besteller_kuerzel: "MT" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.updated).toEqual([ID_A]);
    expect(json.was_already_correct).toEqual([ID_B]);
    expect(json.errors).toHaveLength(1);
    expect(json.errors[0].id).toBe(ID_C);
    expect(json.total).toBe(3);
  });
});
