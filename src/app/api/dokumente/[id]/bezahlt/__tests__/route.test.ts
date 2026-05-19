/**
 * Tests für POST /api/dokumente/[id]/bezahlt.
 *
 * 19.05.2026 (A2.5) — Pro-Rechnungs-Doku-Granularität (statt pro Bestellung).
 * Nur Buchhaltung + Admin dürfen markieren. Idempotenz: schon bezahlt =
 * already-Flag. DATEV-Versand läuft async via after() — wird in Tests gemockt.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeRequest, params, TEST_PROFIL, TEST_UUID } from "@/test-helpers/api-route";

const mockCheckCsrf = vi.fn(() => true);
const mockCreateServerClient = vi.fn();
const mockCreateServiceClient = vi.fn();
const mockAfter = vi.fn();
const mockSendDatev = vi.fn();
const mockStempelPdf = vi.fn();

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: (fn: () => void) => mockAfter(fn) };
});
vi.mock("@/lib/csrf", () => ({ checkCsrf: () => mockCheckCsrf() }));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => mockCreateServerClient(),
  createTypedServerSupabaseClient: () => mockCreateServerClient(),
}));
vi.mock("@/lib/supabase", () => ({ createServiceClient: () => mockCreateServiceClient() }));
vi.mock("@/lib/email", () => ({
  sendeRechnungAnDatev: (...args: unknown[]) => mockSendDatev(...args),
  stempelPdfMitDatev: (...args: unknown[]) => mockStempelPdf(...args),
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

interface DokuShape {
  id: string;
  typ: string;
  storage_pfad: string | null;
  bezahlt_am: string | null;
  gesamtbetrag: number | null;
  bestellnummer_erkannt: string | null;
  bestellung_id: string;
  bestellung: {
    id: string;
    status: string;
    bestellnummer: string | null;
    haendler_name: string | null;
    betrag: number | null;
  } | null;
}

function makeAuthClient(user: { id: string } | null, profil?: typeof TEST_PROFIL.buchhaltung) {
  const single = vi.fn().mockResolvedValue({ data: profil ?? null, error: null });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from,
  };
}

function makeServiceClient(opts: { doku?: DokuShape | null; updateError?: { message: string } | null }) {
  // SELECT-chain: from("dokumente").select(...).eq().maybeSingle()
  const maybeSingleSelect = vi.fn().mockResolvedValue({ data: opts.doku ?? null, error: null });
  // UPDATE-chain: from("dokumente").update().eq().is() oder .eq() Standalone
  const finalUpdate = vi.fn().mockResolvedValue({ data: null, error: opts.updateError ?? null });

  let mode: "select" | "update" = "select";
  const eqFn = vi.fn().mockImplementation(() => {
    if (mode === "select") return { maybeSingle: maybeSingleSelect };
    // Update-chain: nach .eq() entweder .is() oder direkt Promise
    const isFn = vi.fn().mockImplementation(() => finalUpdate());
    return {
      is: isFn,
      then: (cb: (v: unknown) => unknown) => finalUpdate().then(cb),
    };
  });
  const select = vi.fn().mockImplementation(() => {
    mode = "select";
    return { eq: eqFn };
  });
  const update = vi.fn().mockImplementation(() => {
    mode = "update";
    return { eq: eqFn };
  });
  const insert = vi.fn().mockResolvedValue({ data: null, error: null }); // webhook_logs
  const storageFrom = vi.fn().mockReturnValue({
    download: vi.fn().mockResolvedValue({
      data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
      error: null,
    }),
  });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "dokumente") return { select, update };
    if (table === "webhook_logs") return { insert };
    return { select, update, insert };
  });
  return { from, storage: { from: storageFrom }, _update: update, _select: select };
}

describe("POST /api/dokumente/[id]/bezahlt", () => {
  beforeEach(() => {
    mockCheckCsrf.mockReset().mockReturnValue(true);
    mockCreateServerClient.mockReset();
    mockCreateServiceClient.mockReset();
    mockAfter.mockReset();
    mockSendDatev.mockReset().mockResolvedValue({ success: true });
    mockStempelPdf.mockReset().mockImplementation(async (buf) => buf);
  });

  it("403 bei CSRF-Fail", async () => {
    mockCheckCsrf.mockReturnValue(false);
    const { POST } = await import("../route");
    const res = await POST(
      makeRequest({ bezahlt: true }, { origin: "http://evil.com" }),
      params({ id: TEST_UUID.dokument }),
    );
    expect(res.status).toBe(403);
  });

  it("400 bei invalider ID", async () => {
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bezahlt: true }), params({ id: "not-uuid" }));
    expect(res.status).toBe(400);
  });

  it("401 wenn nicht eingeloggt", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient(null));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bezahlt: true }), params({ id: TEST_UUID.dokument }));
    expect(res.status).toBe(401);
  });

  it("403 wenn Besteller versucht zu markieren (nur Buchhaltung + Admin)", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, TEST_PROFIL.besteller_MT));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bezahlt: true }), params({ id: TEST_UUID.dokument }));
    expect(res.status).toBe(403);
  });

  it("404 wenn Doku nicht existiert", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, TEST_PROFIL.buchhaltung));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({ doku: null }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bezahlt: true }), params({ id: TEST_UUID.dokument }));
    expect(res.status).toBe(404);
  });

  it("400 wenn Doku kein Rechnungs-Typ", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, TEST_PROFIL.buchhaltung));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      doku: {
        id: TEST_UUID.dokument, typ: "bestellbestaetigung", storage_pfad: null, bezahlt_am: null,
        gesamtbetrag: null, bestellnummer_erkannt: null, bestellung_id: TEST_UUID.bestellung,
        bestellung: { id: TEST_UUID.bestellung, status: "freigegeben", bestellnummer: "B123", haendler_name: "Test", betrag: 100 },
      },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bezahlt: true }), params({ id: TEST_UUID.dokument }));
    expect(res.status).toBe(400);
  });

  it("400 wenn Bestellung nicht freigegeben", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, TEST_PROFIL.buchhaltung));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      doku: {
        id: TEST_UUID.dokument, typ: "rechnung", storage_pfad: "path/x.pdf", bezahlt_am: null,
        gesamtbetrag: 100, bestellnummer_erkannt: "R1", bestellung_id: TEST_UUID.bestellung,
        bestellung: { id: TEST_UUID.bestellung, status: "vollstaendig", bestellnummer: "B1", haendler_name: "T", betrag: 100 },
      },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bezahlt: true }), params({ id: TEST_UUID.dokument }));
    expect(res.status).toBe(400);
  });

  it("Happy-Path: bezahlt=true → 200 + DATEV-Versand getriggert", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, TEST_PROFIL.buchhaltung));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      doku: {
        id: TEST_UUID.dokument, typ: "rechnung", storage_pfad: "path/x.pdf", bezahlt_am: null,
        gesamtbetrag: 100, bestellnummer_erkannt: "R1", bestellung_id: TEST_UUID.bestellung,
        bestellung: { id: TEST_UUID.bestellung, status: "freigegeben", bestellnummer: "B1", haendler_name: "Vendor", betrag: 100 },
      },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bezahlt: true }), params({ id: TEST_UUID.dokument }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.bezahlt).toBe(true);
    // DATEV-Versand wurde via after() registriert (nicht direkt aufgerufen)
    expect(mockAfter).toHaveBeenCalledTimes(1);
  });

  it("Idempotenz: schon bezahlt → 200 mit already=true, kein DATEV-Re-Versand", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, TEST_PROFIL.buchhaltung));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      doku: {
        id: TEST_UUID.dokument, typ: "rechnung", storage_pfad: "path/x.pdf",
        bezahlt_am: "2026-05-19T10:00:00Z", // schon bezahlt
        gesamtbetrag: 100, bestellnummer_erkannt: "R1", bestellung_id: TEST_UUID.bestellung,
        bestellung: { id: TEST_UUID.bestellung, status: "freigegeben", bestellnummer: "B1", haendler_name: "T", betrag: 100 },
      },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bezahlt: true }), params({ id: TEST_UUID.dokument }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.already).toBe(true);
    // KEIN after() → kein DATEV-Re-Versand
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it("bezahlt=false → Update nullt bezahlt_am, kein DATEV-Versand", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, TEST_PROFIL.buchhaltung));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      doku: {
        id: TEST_UUID.dokument, typ: "rechnung", storage_pfad: "path/x.pdf",
        bezahlt_am: "2026-05-19T10:00:00Z",
        gesamtbetrag: 100, bestellnummer_erkannt: "R1", bestellung_id: TEST_UUID.bestellung,
        bestellung: { id: TEST_UUID.bestellung, status: "freigegeben", bestellnummer: "B1", haendler_name: "T", betrag: 100 },
      },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bezahlt: false }), params({ id: TEST_UUID.dokument }));
    expect(res.status).toBe(200);
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it("500 bei DB-Update-Fehler", async () => {
    mockCreateServerClient.mockReturnValue(makeAuthClient({ id: "u1" }, TEST_PROFIL.buchhaltung));
    mockCreateServiceClient.mockReturnValue(makeServiceClient({
      doku: {
        id: TEST_UUID.dokument, typ: "rechnung", storage_pfad: "path/x.pdf", bezahlt_am: null,
        gesamtbetrag: 100, bestellnummer_erkannt: "R1", bestellung_id: TEST_UUID.bestellung,
        bestellung: { id: TEST_UUID.bestellung, status: "freigegeben", bestellnummer: "B1", haendler_name: "T", betrag: 100 },
      },
      updateError: { message: "DB-fail" },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ bezahlt: true }), params({ id: TEST_UUID.dokument }));
    expect(res.status).toBe(500);
  });
});
