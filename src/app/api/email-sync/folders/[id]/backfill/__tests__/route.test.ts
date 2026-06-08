/**
 * Tests für POST /api/email-sync/folders/:id/backfill (08.06.2026).
 *
 * Backfill liest Mails direkt aus dem Outlook-Folder (ohne Delta) und
 * vergleicht sie mit email_processing_log:
 *   - Nicht im Log → neu claimen
 *   - status='irrelevant' + 'bootstrap_skip' → reaktivieren auf 'pending'
 *   - status='failed' → retry_count reset auf 0
 *   - status='processed' / 'pending' → no-op
 *   - status='irrelevant' aus anderem Grund → skipped (nicht angefasst)
 *
 * Dry-Run-Modus darf NICHTS in der DB ändern, nur Zahlen reporten.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { TEST_PROFIL } from "@/test-helpers/api-route";
import type { MailMessage } from "@/lib/microsoft-graph/delta";

const mockCheckCsrf = vi.fn(() => true);
const mockGetProfil = vi.fn();
const mockCreateServerClient = vi.fn();
const mockCreateServiceClient = vi.fn();
const mockListMessages = vi.fn();

vi.mock("@/lib/csrf", () => ({
  checkCsrf: () => mockCheckCsrf(),
}));
vi.mock("@/lib/auth", () => ({
  getBenutzerProfil: () => mockGetProfil(),
  requireRoles: (profil: { rolle?: string } | null, ...roles: string[]) =>
    !!(profil?.rolle && roles.includes(profil.rolle)),
}));
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => mockCreateServerClient(),
}));
vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => mockCreateServiceClient(),
}));
vi.mock("@/lib/microsoft-graph/messages", () => ({
  listMessagesSince: (opts: unknown) => mockListMessages(opts),
}));
vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

const FOLDER_ID = "f1111111-1111-4111-8111-111111111111";

function makeRequest(body: Record<string, unknown>, opts: { origin?: string } = {}) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: opts.origin ?? "http://localhost:3000",
  };
  return new NextRequest(`http://localhost:3000/api/email-sync/folders/${FOLDER_ID}/backfill`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function makeContext() {
  return { params: Promise.resolve({ id: FOLDER_ID }) };
}

function makeMsg(idx: number, internetMessageId?: string): MailMessage {
  return {
    id: `g-${idx}`,
    internetMessageId: internetMessageId ?? `<msg-${idx}@example.com>`,
    receivedDateTime: new Date(2026, 5, 8, 11, 30, 0).toISOString(),
    subject: `Test ${idx}`,
    bodyPreview: "",
    body: { contentType: "text", content: "" },
    from: { emailAddress: { address: "sender@example.com" } },
    hasAttachments: true,
    parentFolderId: "GRAPH-F1",
  };
}

interface LogRow {
  internet_message_id: string;
  status: "pending" | "processed" | "failed" | "irrelevant";
  error_msg: string | null;
}

interface ServiceOpts {
  /** Folder-Daten für mail_sync_folders-Lookup. Null = nicht gefunden. */
  folder?: { id: string; graph_folder_id: string; folder_name: string } | null;
  /** Existierende Log-Einträge (Backfill-Lookup) */
  existingLogs?: LogRow[];
  /** Pro-ID Update-Errors (z.B. um DB-Failure zu simulieren) */
  updateError?: string;
  /** Pro-ID Insert-Errors */
  insertError?: { code?: string; message: string };
}

function makeServiceClient(opts: ServiceOpts = {}) {
  const updates: Array<{ internetMessageId: string; patch: Record<string, unknown> }> = [];
  const inserts: Array<Record<string, unknown>> = [];

  // Default: folder existiert
  const folder = opts.folder === undefined ? {
    id: FOLDER_ID,
    graph_folder_id: "GRAPH-F1",
    folder_name: "in Sachen Rechnungen",
  } : opts.folder;

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "mail_sync_folders") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: folder, error: null }),
          }),
        }),
      };
    }
    if (table === "email_processing_log") {
      return {
        select: () => ({
          in: () =>
            Promise.resolve({ data: opts.existingLogs ?? [], error: null }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: (_col: string, val: string) => {
            if (opts.updateError) {
              return Promise.resolve({ data: null, error: { message: opts.updateError } });
            }
            updates.push({ internetMessageId: val, patch });
            return Promise.resolve({ data: null, error: null });
          },
        }),
        insert: (row: Record<string, unknown>) => {
          if (opts.insertError) {
            return Promise.resolve({ data: null, error: opts.insertError });
          }
          inserts.push(row);
          return Promise.resolve({ data: row, error: null });
        },
      };
    }
    return { select: vi.fn(), insert: vi.fn(), update: vi.fn() };
  });

  return { from, updates, inserts };
}

/** Async-Gen Helper für mocked listMessagesSince */
function asyncGen(pages: MailMessage[][]) {
  return (async function* () {
    for (const p of pages) yield p;
  })();
}

describe("POST /api/email-sync/folders/:id/backfill", () => {
  beforeEach(() => {
    mockCheckCsrf.mockReset().mockReturnValue(true);
    mockGetProfil.mockReset();
    mockCreateServerClient.mockReset();
    mockCreateServiceClient.mockReset();
    mockListMessages.mockReset();
    // Default: createServerSupabaseClient liefert einen Service-Client-Lookalike
    // (für mail_sync_folders SELECT)
  });

  it("403 bei CSRF-Fail", async () => {
    mockCheckCsrf.mockReturnValue(false);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ days: 7 }, { origin: "http://evil.com" }), makeContext());
    expect(res.status).toBe(403);
  });

  it("403 für Nicht-Admin (Besteller)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.besteller_MT);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ days: 7 }), makeContext());
    expect(res.status).toBe(403);
  });

  it("403 für Buchhaltung", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.buchhaltung);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ days: 7 }), makeContext());
    expect(res.status).toBe(403);
  });

  it("400 bei fehlendem since UND days", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    const service = makeServiceClient();
    mockCreateServerClient.mockReturnValue(service);
    mockCreateServiceClient.mockReturnValue(service);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({}), makeContext());
    expect(res.status).toBe(400);
  });

  it("400 bei days > 90", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    const service = makeServiceClient();
    mockCreateServerClient.mockReturnValue(service);
    mockCreateServiceClient.mockReturnValue(service);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ days: 100 }), makeContext());
    expect(res.status).toBe(400);
  });

  it("400 bei since >90 Tage zurück", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    const service = makeServiceClient();
    mockCreateServerClient.mockReturnValue(service);
    mockCreateServiceClient.mockReturnValue(service);
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ since: oldDate }), makeContext());
    expect(res.status).toBe(400);
  });

  it("400 bei ungültiger UUID", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    const ctx = { params: Promise.resolve({ id: "nicht-uuid" }) };
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ days: 7 }), ctx);
    expect(res.status).toBe(400);
  });

  it("404 wenn Folder nicht existiert", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    const service = makeServiceClient({ folder: null });
    mockCreateServerClient.mockReturnValue(service);
    mockCreateServiceClient.mockReturnValue(service);
    const { POST } = await import("../route");
    const res = await POST(makeRequest({ days: 7 }), makeContext());
    expect(res.status).toBe(404);
  });

  it("dryRun=true verändert NICHTS (keine inserts, keine updates)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    mockListMessages.mockReturnValue(asyncGen([[makeMsg(1), makeMsg(2)]]));
    // Beide unbekannt → würden geclaimt werden, aber dryRun
    const service = makeServiceClient({ existingLogs: [] });
    mockCreateServerClient.mockReturnValue(service);
    mockCreateServiceClient.mockReturnValue(service);

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ days: 7, dryRun: true }), makeContext());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.dryRun).toBe(true);
    expect(json.newly_claimed).toBe(2);
    expect(json.total_found).toBe(2);
    // Keine DB-Mutationen
    expect(service.inserts).toHaveLength(0);
    expect(service.updates).toHaveLength(0);
  });

  it("claimt fehlende Mails (kein Log-Eintrag → newly_claimed++)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    mockListMessages.mockReturnValue(asyncGen([[makeMsg(1), makeMsg(2), makeMsg(3)]]));
    const service = makeServiceClient({ existingLogs: [] });
    mockCreateServerClient.mockReturnValue(service);
    mockCreateServiceClient.mockReturnValue(service);

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ days: 7 }), makeContext());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.newly_claimed).toBe(3);
    expect(service.inserts).toHaveLength(3);
    expect(service.inserts[0].status).toBe("pending");
  });

  it("reaktiviert bootstrap_skip", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    mockListMessages.mockReturnValue(asyncGen([[makeMsg(1, "<bs-1@x.com>")]]));
    const service = makeServiceClient({
      existingLogs: [
        { internet_message_id: "<bs-1@x.com>", status: "irrelevant", error_msg: "bootstrap_skip" },
      ],
    });
    mockCreateServerClient.mockReturnValue(service);
    mockCreateServiceClient.mockReturnValue(service);

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ days: 7 }), makeContext());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reactivated_bootstrap_skip).toBe(1);
    expect(json.newly_claimed).toBe(0);
    expect(service.updates).toHaveLength(1);
    expect(service.updates[0].patch.status).toBe("pending");
    expect(service.updates[0].patch.retry_count).toBe(0);
  });

  it("setzt failed zurück (retry_count = 0)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    mockListMessages.mockReturnValue(asyncGen([[makeMsg(1, "<f-1@x.com>")]]));
    const service = makeServiceClient({
      existingLogs: [
        { internet_message_id: "<f-1@x.com>", status: "failed", error_msg: "timeout" },
      ],
    });
    mockCreateServerClient.mockReturnValue(service);
    mockCreateServiceClient.mockReturnValue(service);

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ days: 7 }), makeContext());
    const json = await res.json();
    expect(json.reset_failed).toBe(1);
    expect(service.updates[0].patch.retry_count).toBe(0);
    expect(service.updates[0].patch.status).toBe("pending");
  });

  it("processed-Mails sind no-op", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    mockListMessages.mockReturnValue(asyncGen([[makeMsg(1, "<p-1@x.com>")]]));
    const service = makeServiceClient({
      existingLogs: [
        { internet_message_id: "<p-1@x.com>", status: "processed", error_msg: null },
      ],
    });
    mockCreateServerClient.mockReturnValue(service);
    mockCreateServiceClient.mockReturnValue(service);

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ days: 7 }), makeContext());
    const json = await res.json();
    expect(json.already_processed).toBe(1);
    expect(service.updates).toHaveLength(0);
    expect(service.inserts).toHaveLength(0);
  });

  it("pending-Mails sind no-op", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    mockListMessages.mockReturnValue(asyncGen([[makeMsg(1, "<pn-1@x.com>")]]));
    const service = makeServiceClient({
      existingLogs: [
        { internet_message_id: "<pn-1@x.com>", status: "pending", error_msg: null },
      ],
    });
    mockCreateServerClient.mockReturnValue(service);
    mockCreateServiceClient.mockReturnValue(service);

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ days: 7 }), makeContext());
    const json = await res.json();
    expect(json.already_pending).toBe(1);
    expect(service.updates).toHaveLength(0);
  });

  it("irrelevant aus anderem Grund (z.B. classify) wird NICHT angefasst (skipped)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    mockListMessages.mockReturnValue(asyncGen([[makeMsg(1, "<irr-1@x.com>")]]));
    const service = makeServiceClient({
      existingLogs: [
        { internet_message_id: "<irr-1@x.com>", status: "irrelevant", error_msg: "vorfilter_nein:newsletter" },
      ],
    });
    mockCreateServerClient.mockReturnValue(service);
    mockCreateServiceClient.mockReturnValue(service);

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ days: 7 }), makeContext());
    const json = await res.json();
    expect(json.skipped).toBe(1);
    expect(json.reactivated_bootstrap_skip).toBe(0);
    expect(service.updates).toHaveLength(0);
  });

  it("Mix-Szenario: 1 processed + 1 bootstrap_skip + 1 failed + 2 neue + 1 skipped", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    mockListMessages.mockReturnValue(asyncGen([[
      makeMsg(1, "<p@x.com>"),
      makeMsg(2, "<bs@x.com>"),
      makeMsg(3, "<f@x.com>"),
      makeMsg(4, "<new1@x.com>"),
      makeMsg(5, "<new2@x.com>"),
      makeMsg(6, "<irr@x.com>"),
    ]]));
    const service = makeServiceClient({
      existingLogs: [
        { internet_message_id: "<p@x.com>", status: "processed", error_msg: null },
        { internet_message_id: "<bs@x.com>", status: "irrelevant", error_msg: "bootstrap_skip" },
        { internet_message_id: "<f@x.com>", status: "failed", error_msg: "x" },
        { internet_message_id: "<irr@x.com>", status: "irrelevant", error_msg: "vorfilter_nein:x" },
      ],
    });
    mockCreateServerClient.mockReturnValue(service);
    mockCreateServiceClient.mockReturnValue(service);

    const { POST } = await import("../route");
    const res = await POST(makeRequest({ days: 7 }), makeContext());
    const json = await res.json();
    expect(json.total_found).toBe(6);
    expect(json.already_processed).toBe(1);
    expect(json.reactivated_bootstrap_skip).toBe(1);
    expect(json.reset_failed).toBe(1);
    expect(json.newly_claimed).toBe(2);
    expect(json.skipped).toBe(1);
  });

  it("days=7 default: keine reaktivierung wenn flags off (reactivateBootstrapSkip=false)", async () => {
    mockGetProfil.mockResolvedValue(TEST_PROFIL.admin);
    mockListMessages.mockReturnValue(asyncGen([[makeMsg(1, "<bs-1@x.com>")]]));
    const service = makeServiceClient({
      existingLogs: [
        { internet_message_id: "<bs-1@x.com>", status: "irrelevant", error_msg: "bootstrap_skip" },
      ],
    });
    mockCreateServerClient.mockReturnValue(service);
    mockCreateServiceClient.mockReturnValue(service);

    const { POST } = await import("../route");
    const res = await POST(
      makeRequest({ days: 7, reactivateBootstrapSkip: false }),
      makeContext(),
    );
    const json = await res.json();
    expect(json.reactivated_bootstrap_skip).toBe(0);
    expect(json.skipped).toBe(1); // fällt in den allgemeinen irrelevant-Fall
  });
});
