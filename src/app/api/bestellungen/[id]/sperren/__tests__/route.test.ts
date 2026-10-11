/**
 * Tests fuer POST/DELETE /api/bestellungen/[id]/sperren (11.10.2026).
 *
 * Die Sperre ist der Schutz gegen "aus Versehen freigegeben" — deshalb
 * stehen hier vor allem die Rechte und der Pflicht-Grund unter Test.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest, params, TEST_PROFIL, TEST_UUID } from "@/test-helpers/api-route";

const mockGetProfil = vi.fn();
const mockCheckCsrf = vi.fn(() => true);
const mockCreateServiceClient = vi.fn();

vi.mock("@/lib/auth", () => ({
  getBenutzerProfil: () => mockGetProfil(),
  requireRoles: () => true,
}));
vi.mock("@/lib/csrf", () => ({
  checkCsrf: () => mockCheckCsrf(),
}));
vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => mockCreateServiceClient(),
}));
vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

interface Bestellung {
  id: string;
  besteller_kuerzel: string;
  bestellungsart: string;
  gesperrt_am: string | null;
  gesperrt_von: string | null;
  sperrgrund: string | null;
}

function makeService(bestellung: Bestellung | null) {
  const updates: Array<{ werte: Record<string, unknown>; filter: string[] }> = [];
  const kommentare: Array<Record<string, unknown>> = [];
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "bestellungen") {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: bestellung, error: null }) }),
        }),
        update: (werte: Record<string, unknown>) => {
          const eintrag = { werte, filter: [] as string[] };
          updates.push(eintrag);
          const chain = {
            eq: (c: string) => {
              eintrag.filter.push(`eq:${c}`);
              return chain;
            },
            is: (c: string) => {
              eintrag.filter.push(`is:${c}`);
              return chain;
            },
            then: (resolve: (v: { data: null; error: null }) => unknown) =>
              Promise.resolve({ data: null, error: null }).then(resolve),
          };
          return chain;
        },
      };
    }
    if (table === "kommentare") {
      return {
        insert: (row: Record<string, unknown>) => {
          kommentare.push(row);
          return Promise.resolve({ data: null, error: null });
        },
      };
    }
    throw new Error(`unerwartete Tabelle ${table}`);
  });
  return { from, updates, kommentare };
}

const offen: Bestellung = {
  id: TEST_UUID.bestellung,
  besteller_kuerzel: "CR",
  bestellungsart: "material",
  gesperrt_am: null,
  gesperrt_von: null,
  sperrgrund: null,
};
const gesperrt: Bestellung = {
  ...offen,
  gesperrt_am: "2026-10-11T08:00:00Z",
  gesperrt_von: "NJ",
  sperrgrund: "Rechnung beim Anwalt",
};

const ctx = params({ id: TEST_UUID.bestellung });

describe("POST /api/bestellungen/[id]/sperren", () => {
  beforeEach(() => {
    mockGetProfil.mockReset();
    mockCheckCsrf.mockReset().mockReturnValue(true);
    mockCreateServiceClient.mockReset();
  });

  it("403 bei CSRF-Fail", async () => {
    mockCheckCsrf.mockReturnValue(false);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ grund: "Anwalt" }, { origin: "http://evil.com" }), ctx);
    expect(res.status).toBe(403);
  });

  it("400 bei ungueltiger ID", async () => {
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ grund: "Anwalt" }), params({ id: "nope" }));
    expect(res.status).toBe(400);
  });

  it("401 ohne Anmeldung", async () => {
    mockGetProfil.mockResolvedValue(null);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ grund: "Anwalt" }), ctx);
    expect(res.status).toBe(401);
  });

  it("400 ohne Grund — der Grund ist Pflicht", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    mockCreateServiceClient.mockReturnValue(makeService(offen));
    const { POST } = await import("../route");
    expect((await POST(makeRequest({}), ctx)).status).toBe(400);
    expect((await POST(makeRequest({ grund: "  " }), ctx)).status).toBe(400);
    expect((await POST(makeRequest({ grund: "ok" }), ctx)).status).toBe(400);
  });

  it("404 wenn Bestellung fehlt", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    mockCreateServiceClient.mockReturnValue(makeService(null));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ grund: "Rechnung beim Anwalt" }), ctx);
    expect(res.status).toBe(404);
  });

  it("403 wenn Besteller fremde Material-Bestellung sperren will", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_MT);
    const svc = makeService(offen);
    mockCreateServiceClient.mockReturnValue(svc);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ grund: "Rechnung beim Anwalt" }), ctx);
    expect(res.status).toBe(403);
    expect(svc.updates).toHaveLength(0);
  });

  it("Buchhaltung darf sperren: Felder, Guard und Kommentar", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.buchhaltung);
    const svc = makeService(offen);
    mockCreateServiceClient.mockReturnValue(svc);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ grund: "  Rechnung beim <Anwalt>  " }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.sperrgrund).toBe("Rechnung beim Anwalt");
    expect(json.gesperrt_von).toBe("NJ");

    expect(svc.updates).toHaveLength(1);
    const [u] = svc.updates;
    expect(u.werte.sperrgrund).toBe("Rechnung beim Anwalt");
    expect(u.werte.gesperrt_von).toBe("NJ");
    expect(typeof u.werte.gesperrt_am).toBe("string");
    // Race-Schutz: nur setzen, wenn noch niemand gesperrt hat
    expect(u.filter).toEqual(["eq:id", "is:gesperrt_am"]);

    expect(svc.kommentare).toHaveLength(1);
    expect(svc.kommentare[0].text).toBe("Rechnung gesperrt — Grund: Rechnung beim Anwalt");
    expect(svc.kommentare[0].autor_kuerzel).toBe("NJ");
  });

  it("Besteller darf eigene Bestellung sperren", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_CR);
    mockCreateServiceClient.mockReturnValue(makeService(offen));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ grund: "Doppelt berechnet" }), ctx);
    expect(res.status).toBe(200);
  });

  it("409 wenn schon gesperrt — die erste Sperre bleibt", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    const svc = makeService(gesperrt);
    mockCreateServiceClient.mockReturnValue(svc);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ grund: "Noch ein Grund" }), ctx);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("NJ");
    expect(json.error).toContain("Rechnung beim Anwalt");
    expect(svc.updates).toHaveLength(0);
  });
});

describe("DELETE /api/bestellungen/[id]/sperren", () => {
  beforeEach(() => {
    mockGetProfil.mockReset();
    mockCheckCsrf.mockReset().mockReturnValue(true);
    mockCreateServiceClient.mockReset();
  });

  it("403 wenn jemand anderes als Urheber oder Verwaltung aufheben will", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_CR);
    const svc = makeService(gesperrt);
    mockCreateServiceClient.mockReturnValue(svc);
    const { DELETE } = await import("../route");
    const res = await DELETE(makeRequest({}, { method: "DELETE" }), ctx);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("NJ");
    expect(svc.updates).toHaveLength(0);
  });

  it("Urheber darf aufheben: Felder leer, Kommentar nennt alte Sperre", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.buchhaltung);
    const svc = makeService(gesperrt);
    mockCreateServiceClient.mockReturnValue(svc);
    const { DELETE } = await import("../route");
    const res = await DELETE(makeRequest({}, { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
    expect(svc.updates).toHaveLength(1);
    expect(svc.updates[0].werte).toMatchObject({ gesperrt_am: null, gesperrt_von: null, sperrgrund: null });
    expect(svc.kommentare[0].text).toBe("Sperre aufgehoben (gesetzt von NJ: Rechnung beim Anwalt)");
  });

  it("Admin darf jede Sperre aufheben", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    mockCreateServiceClient.mockReturnValue(makeService(gesperrt));
    const { DELETE } = await import("../route");
    const res = await DELETE(makeRequest({}, { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
  });

  it("nicht gesperrt → 200 already, nichts geschrieben", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_MT);
    const svc = makeService(offen);
    mockCreateServiceClient.mockReturnValue(svc);
    const { DELETE } = await import("../route");
    const res = await DELETE(makeRequest({}, { method: "DELETE" }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).already).toBe(true);
    expect(svc.updates).toHaveLength(0);
  });
});
