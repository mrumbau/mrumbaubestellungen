/**
 * Tests für POST /api/bestellungen/[id]/projekt-bestaetigen.
 *
 * 19.05.2026 (A2.5) — KI-Projekt-Vorschlag bestätigen/ablehnen/korrigieren.
 * Permission-Pfad: Admin oder Besteller (own oder SU/Abo). Drei Aktions-Branches.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeRequest, params, TEST_UUID } from "@/test-helpers/api-route";

const mockCheckCsrf = vi.fn(() => true);
const mockCreateClient = vi.fn();
const mockAktAffinitaet = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/csrf", () => ({ checkCsrf: () => mockCheckCsrf() }));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => mockCreateClient(),
  createTypedServerSupabaseClient: () => mockCreateClient(),
}));
vi.mock("@/lib/openai", () => ({
  aktualisiereBestellerAffinitaet: (...args: unknown[]) => mockAktAffinitaet(...args),
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

interface BestellungShape {
  id: string;
  besteller_kuerzel: string;
  bestellungsart: string | null;
  projekt_vorschlag_id: string | null;
  projekt_vorschlag_konfidenz?: number;
  projekt_vorschlag_methode?: string;
  projekt_vorschlag_begruendung?: string;
  lieferadresse_erkannt: string | null;
}

const ADMIN_PROFIL = { rolle: "admin", kuerzel: "MH", name: "Mohammed" };
const BESTELLER_MT = { rolle: "besteller", kuerzel: "MT", name: "Marlon" };
const BUCHHALTUNG = { rolle: "buchhaltung", kuerzel: "NJ", name: "Nada" };

function makeClient(opts: {
  user?: { id: string } | null;
  profil?: { rolle: string; kuerzel: string; name: string } | null;
  bestellung?: BestellungShape | null;
  projekt?: { id: string; name: string; adresse_keywords?: string[] } | null;
}) {
  const profilSingle = vi.fn().mockResolvedValue({ data: opts.profil ?? null, error: null });
  const bestellungSingle = vi.fn().mockResolvedValue({ data: opts.bestellung ?? null, error: null });
  const projektSingle = vi.fn().mockResolvedValue({ data: opts.projekt ?? null, error: null });

  let lastFrom: string = "";
  const eqUpdate = vi.fn().mockResolvedValue({ data: null, error: null });
  const update = vi.fn().mockReturnValue({ eq: eqUpdate });
  const insert = vi.fn().mockResolvedValue({ data: null, error: null });

  const eq = vi.fn().mockImplementation(() => {
    if (lastFrom === "benutzer_rollen") return { single: profilSingle };
    if (lastFrom === "bestellungen") return { single: bestellungSingle };
    if (lastFrom === "projekte") return { single: projektSingle };
    return { single: vi.fn().mockResolvedValue({ data: null, error: null }) };
  });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockImplementation((table: string) => {
    lastFrom = table;
    if (table === "kommentare") return { insert };
    return { select, update };
  });
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: opts.user ?? null }, error: null }) },
    from,
    _insert: insert,
    _update: update,
  };
}

describe("POST /api/bestellungen/[id]/projekt-bestaetigen", () => {
  beforeEach(() => {
    mockCheckCsrf.mockReset().mockReturnValue(true);
    mockCreateClient.mockReset();
    mockAktAffinitaet.mockClear();
  });

  it("403 bei CSRF-Fail", async () => {
    mockCheckCsrf.mockReturnValue(false);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({}, { origin: "http://evil.com" }), params({ id: TEST_UUID.bestellung }));
    expect(res.status).toBe(403);
  });

  it("400 bei invalider Bestellung-ID", async () => {
    const { POST } = await import("../route");
    const res = await POST(makeRequest({}), params({ id: "not-uuid" }));
    expect(res.status).toBe(400);
  });

  it("401 wenn nicht eingeloggt", async () => {
    mockCreateClient.mockReturnValue(makeClient({ user: null }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({}), params({ id: TEST_UUID.bestellung }));
    expect(res.status).toBe(401);
  });

  it("403 für Buchhaltung", async () => {
    mockCreateClient.mockReturnValue(makeClient({ user: { id: "u1" }, profil: BUCHHALTUNG }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ aktion: "bestaetigen" }), params({ id: TEST_UUID.bestellung }));
    expect(res.status).toBe(403);
  });

  it("400 bei ungültiger aktion", async () => {
    mockCreateClient.mockReturnValue(makeClient({
      user: { id: "u1" }, profil: ADMIN_PROFIL,
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ aktion: "foo" }), params({ id: TEST_UUID.bestellung }));
    expect(res.status).toBe(400);
  });

  it("404 wenn Bestellung nicht existiert", async () => {
    mockCreateClient.mockReturnValue(makeClient({
      user: { id: "u1" }, profil: ADMIN_PROFIL, bestellung: null,
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ aktion: "bestaetigen" }), params({ id: TEST_UUID.bestellung }));
    expect(res.status).toBe(404);
  });

  it("403 wenn Besteller fremde Material-Bestellung bestätigen will", async () => {
    mockCreateClient.mockReturnValue(makeClient({
      user: { id: "u1" }, profil: BESTELLER_MT,
      bestellung: {
        id: TEST_UUID.bestellung, besteller_kuerzel: "CR", bestellungsart: "material",
        projekt_vorschlag_id: TEST_UUID.bestellung_2, lieferadresse_erkannt: null,
      },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ aktion: "bestaetigen" }), params({ id: TEST_UUID.bestellung }));
    expect(res.status).toBe(403);
  });

  it("Besteller darf SU-Bestellung bestätigen (Bypass)", async () => {
    mockCreateClient.mockReturnValue(makeClient({
      user: { id: "u1" }, profil: BESTELLER_MT,
      bestellung: {
        id: TEST_UUID.bestellung, besteller_kuerzel: "UNBEKANNT", bestellungsart: "subunternehmer",
        projekt_vorschlag_id: TEST_UUID.bestellung_2, lieferadresse_erkannt: "Test-Adresse",
      },
      projekt: { id: TEST_UUID.bestellung_2, name: "Projekt X", adresse_keywords: [] },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ aktion: "bestaetigen" }), params({ id: TEST_UUID.bestellung }));
    expect(res.status).toBe(200);
  });

  it("400 wenn aktion=bestaetigen aber kein Vorschlag existiert", async () => {
    mockCreateClient.mockReturnValue(makeClient({
      user: { id: "u1" }, profil: ADMIN_PROFIL,
      bestellung: {
        id: TEST_UUID.bestellung, besteller_kuerzel: "MT", bestellungsart: "material",
        projekt_vorschlag_id: null, lieferadresse_erkannt: null,
      },
    }));
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ aktion: "bestaetigen" }), params({ id: TEST_UUID.bestellung }));
    expect(res.status).toBe(400);
  });

  it("Happy: aktion=bestaetigen → Update + Audit + Affinitaet", async () => {
    const c = makeClient({
      user: { id: "u1" }, profil: ADMIN_PROFIL,
      bestellung: {
        id: TEST_UUID.bestellung, besteller_kuerzel: "MT", bestellungsart: "material",
        projekt_vorschlag_id: TEST_UUID.bestellung_2, lieferadresse_erkannt: null,
      },
      projekt: { id: TEST_UUID.bestellung_2, name: "Projekt X" },
    });
    mockCreateClient.mockReturnValue(c);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ aktion: "bestaetigen" }), params({ id: TEST_UUID.bestellung }));
    expect(res.status).toBe(200);
    expect(mockAktAffinitaet).toHaveBeenCalledTimes(1);
    expect(c._insert).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("Projekt X"),
    }));
  });

  it("Happy: aktion=ablehnen ohne Korrektur → reset Vorschlag-Felder", async () => {
    const c = makeClient({
      user: { id: "u1" }, profil: ADMIN_PROFIL,
      bestellung: {
        id: TEST_UUID.bestellung, besteller_kuerzel: "MT", bestellungsart: "material",
        projekt_vorschlag_id: TEST_UUID.bestellung_2, lieferadresse_erkannt: null,
      },
    });
    mockCreateClient.mockReturnValue(c);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ aktion: "ablehnen" }), params({ id: TEST_UUID.bestellung }));
    expect(res.status).toBe(200);
    // Kein Affinitaet-Update bei reinem Ablehnen
    expect(mockAktAffinitaet).not.toHaveBeenCalled();
    // Audit-Kommentar mit Begründung "ohne Korrektur"
    expect(c._insert).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("abgelehnt"),
    }));
  });

  it("Happy: aktion=ablehnen mit Korrektur → setzt korrektes_projekt + Affinitaet", async () => {
    const c = makeClient({
      user: { id: "u1" }, profil: ADMIN_PROFIL,
      bestellung: {
        id: TEST_UUID.bestellung, besteller_kuerzel: "MT", bestellungsart: "material",
        projekt_vorschlag_id: TEST_UUID.bestellung_2, lieferadresse_erkannt: null,
      },
      projekt: { id: TEST_UUID.dokument, name: "Korr-Projekt" },
    });
    mockCreateClient.mockReturnValue(c);
    const { POST } = await import("../route");
    const res = await POST(
      makeRequest({ aktion: "ablehnen", korrektes_projekt_id: TEST_UUID.dokument }),
      params({ id: TEST_UUID.bestellung }),
    );
    expect(res.status).toBe(200);
    expect(mockAktAffinitaet).toHaveBeenCalledTimes(1);
    expect(c._insert).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("korrigiert"),
    }));
  });

  it("400 bei invalider korrektes_projekt_id", async () => {
    mockCreateClient.mockReturnValue(makeClient({
      user: { id: "u1" }, profil: ADMIN_PROFIL,
      bestellung: {
        id: TEST_UUID.bestellung, besteller_kuerzel: "MT", bestellungsart: "material",
        projekt_vorschlag_id: TEST_UUID.bestellung_2, lieferadresse_erkannt: null,
      },
    }));
    const { POST } = await import("../route");
    const res = await POST(
      makeRequest({ aktion: "ablehnen", korrektes_projekt_id: "not-uuid" }),
      params({ id: TEST_UUID.bestellung }),
    );
    expect(res.status).toBe(400);
  });
});
