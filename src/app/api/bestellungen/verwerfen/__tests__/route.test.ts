/**
 * Tests für POST /api/bestellungen/verwerfen.
 *
 * 19.05.2026 (A2.5) — Single + Bulk verwerfen. Eigene Auth-Logik (kein
 * requireAuth-Helper) + supabase.auth.getUser + createServiceClient für DELETE.
 *
 * 08.06.2026 (Bulk-Delete-Bug-Fix) — Endpoint refactored auf Per-ID-Loop
 * mit pool_reservations + pool_user_state Cleanup und strukturiertem
 * Response `{ success, deleted, deleted_ids, failed: [{id, reason}] }`.
 * Tests erweitert um: Pool-Cleanup-Verifikation, Partial-Success-Reporting,
 * Alle-Failed-Pfad.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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

interface ServiceOpts {
  bestellungen?: VerwerfenBestellung[];
  /** Map<id, error-msg> — wenn id in der Map, scheitert das DELETE für genau diese ID. */
  deleteErrorsPerId?: Map<string, string>;
  dokumente?: Array<{ email_absender: string; email_betreff: string }>;
}

/**
 * Service-Client mock für actual Writes.
 *
 * 08.06.2026 — angepasst auf Per-ID-Loop:
 *   - bestellungen.delete().eq("id", X) wird einzeln pro ID gerufen
 *   - bei Besteller-Rolle: zusätzlich .or(...) am Ende der Chain
 *   - Mock erlaubt deleteErrorsPerId um partial-failure zu simulieren
 *   - cleanupCounts trackt FK-Cleanup-Calls für Assertions
 */
function makeServiceClient(opts: ServiceOpts = {}) {
  const cleanupCounts: Record<string, number> = {
    pool_reservations: 0,
    pool_user_state: 0,
    webhook_logs: 0,
    freigaben: 0,
    abgleiche: 0,
    kommentare: 0,
    dokumente: 0,
    bestellung_signale: 0,
  };
  const deletedBestellungenIds: string[] = [];

  // dokumente.SELECT.eq() → for verworfene_emails-learning
  const eqDok = vi.fn().mockResolvedValue({ data: opts.dokumente ?? [], error: null });
  // verworfene_emails.INSERT (no-op in tests)
  const insert = vi.fn().mockResolvedValue({ data: null, error: null });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "bestellungen") {
      const bestellungenList = opts.bestellungen ?? [];
      return {
        select: vi.fn().mockImplementation(() => ({
          in: vi.fn().mockResolvedValue({ data: bestellungenList, error: null }),
          eq: vi.fn().mockImplementation((_col: string, val: string) => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: bestellungenList.find((b) => b.id === val) ?? null,
              error: null,
            }),
          })),
        })),
        delete: () => {
          // Per-ID DELETE: chain ist entweder .eq("id", X)  →  (admin)
          //                          oder .eq("id", X).or(...) (besteller)
          // Beide müssen thenable sein (resolve to {data,error}).
          return {
            eq: (_col: string, val: string) => {
              const result = (): Promise<{ data: null; error: { message: string } | null }> => {
                const errMsg = opts.deleteErrorsPerId?.get(val);
                if (!errMsg) deletedBestellungenIds.push(val);
                return Promise.resolve({ data: null, error: errMsg ? { message: errMsg } : null });
              };
              return {
                or: () => result(),
                // direkt-awaitable fallback wenn .or() nicht gerufen wird
                then: (resolve: (v: { data: null; error: { message: string } | null }) => unknown) =>
                  result().then(resolve),
              };
            },
          };
        },
      };
    }
    if (table === "dokumente") {
      return {
        select: vi.fn().mockReturnValue({ eq: eqDok }),
        delete: () => ({
          eq: (_c: string, _v: string) => {
            cleanupCounts.dokumente++;
            return Promise.resolve({ data: null, error: null });
          },
        }),
      };
    }
    // Generic FK-cleanup tables (incl. pool_reservations + pool_user_state)
    if (
      table === "webhook_logs" ||
      table === "freigaben" ||
      table === "abgleiche" ||
      table === "kommentare" ||
      table === "pool_reservations" ||
      table === "pool_user_state" ||
      table === "bestellung_signale"
    ) {
      return {
        delete: () => ({
          eq: (_c: string, _v: string) => {
            cleanupCounts[table]++;
            return Promise.resolve({ data: null, error: null });
          },
        }),
      };
    }
    if (table === "verworfene_emails") {
      return { insert };
    }
    // Fallback
    return {
      select: vi.fn(),
      insert,
      delete: () => ({
        eq: () => Promise.resolve({ data: null, error: null }),
      }),
    };
  });
  return { from, cleanupCounts, deletedBestellungenIds, insertVerworfene: insert };
}

const ID_A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const ID_C = "cccccccc-cccc-4ccc-cccc-cccccccccccc";

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

  it("400 bei fehlender ID (leere Auswahl)", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(TEST_PROFIL.besteller_MT));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("400 bei leerem bestellung_ids-Array", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(TEST_PROFIL.besteller_MT));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_ids: [] }));
    expect(res.status).toBe(400);
  });

  it("400 bei ungültiger UUID", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(TEST_PROFIL.besteller_MT));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_id: "nicht-uuid" }));
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
    expect(json.failed).toEqual([]);
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

  it("Bulk-Verwerfen: alle eigene → success mit deleted_ids-Liste", async () => {
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
    expect(json.deleted_ids).toEqual([ID_A, ID_B]);
    expect(json.failed).toEqual([]);
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

  // 08.06.2026 (Bug-Fix) — pool_reservations + pool_user_state +
  // bestellung_signale müssen IMMER gecleant werden vor dem parent-DELETE,
  // sonst FK-Constraint-Violation. bestellung_signale ist Chrome-Ext-Legacy
  // (Tabelle existiert noch in der DB obwohl Modul stillgelegt) und hat
  // die Sonder-Spalte matched_bestellung_id statt bestellung_id.
  it("FK-Cleanup: pool_reservations + pool_user_state + bestellung_signale werden pro ID gecleant", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(TEST_PROFIL.admin));
    const service = makeServiceClient({
      bestellungen: [
        { id: ID_A, besteller_kuerzel: "MT", bestellungsart: "material" },
        { id: ID_B, besteller_kuerzel: "CR", bestellungsart: "material" },
        { id: ID_C, besteller_kuerzel: "MT", bestellungsart: "material" },
      ],
    });
    mockCreateServiceClient.mockReturnValue(service);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_ids: [ID_A, ID_B, ID_C] }));
    expect(res.status).toBe(200);
    // 3 IDs × 1 Cleanup pro Tabelle = 3 Calls
    expect(service.cleanupCounts.pool_reservations).toBe(3);
    expect(service.cleanupCounts.pool_user_state).toBe(3);
    expect(service.cleanupCounts.dokumente).toBe(3);
    expect(service.cleanupCounts.freigaben).toBe(3);
    expect(service.cleanupCounts.bestellung_signale).toBe(3);
  });

  // Partial-Failure: 1 ID failt am parent-DELETE (z.B. FK-Constraint),
  // andere 2 gehen durch. API muss 200 + strukturierte deleted+failed liefern.
  it("Partial-Failure: 1 von 3 failt → 200 mit deleted=2, failed=[1]", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(TEST_PROFIL.admin));
    const service = makeServiceClient({
      bestellungen: [
        { id: ID_A, besteller_kuerzel: "MT", bestellungsart: "material" },
        { id: ID_B, besteller_kuerzel: "CR", bestellungsart: "material" },
        { id: ID_C, besteller_kuerzel: "MT", bestellungsart: "material" },
      ],
      deleteErrorsPerId: new Map([
        [ID_B, 'update or delete on table "bestellungen" violates foreign key constraint "some_fkey" on table "neue_tabelle"'],
      ]),
    });
    mockCreateServiceClient.mockReturnValue(service);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_ids: [ID_A, ID_B, ID_C] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.deleted).toBe(2);
    expect(json.deleted_ids).toEqual([ID_A, ID_C]);
    expect(json.failed).toHaveLength(1);
    expect(json.failed[0].id).toBe(ID_B);
    expect(json.failed[0].reason).toMatch(/foreign key/);
  });

  // Alle fehlgeschlagen → 500 mit error-Feld
  it("Alle fehlgeschlagen → 500 mit error-Beschreibung", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(TEST_PROFIL.admin));
    const service = makeServiceClient({
      bestellungen: [
        { id: ID_A, besteller_kuerzel: "MT", bestellungsart: "material" },
        { id: ID_B, besteller_kuerzel: "CR", bestellungsart: "material" },
      ],
      deleteErrorsPerId: new Map([
        [ID_A, "DB-Lock"],
        [ID_B, "DB-Lock"],
      ]),
    });
    mockCreateServiceClient.mockReturnValue(service);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bestellung_ids: [ID_A, ID_B] }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.deleted).toBe(0);
    expect(json.failed).toHaveLength(2);
    expect(json.error).toContain("DB-Lock");
  });
});
