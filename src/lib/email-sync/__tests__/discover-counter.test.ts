/**
 * Tests für den Discover-Counter-Bug-Fix (08.06.2026).
 *
 * Wurzel: messagesSeen++ wurde VOR claimMessage() ausgeführt → bereits
 * bekannte Mails blockierten das Budget → bei Bursts >100 Mails wurden
 * Mails nach Position 100 nie geclaimet.
 *
 * Fix: Counter wird NACH erfolgreichem claim erhöht. Bereits-bekannte
 * Mails landen in separatem messagesAlreadyKnown-Counter (Diagnose), nicht
 * im Budget.
 *
 * Diese Tests verifizieren den FOLDER-LEVEL Loop direkt durch deltaSync
 * Mock + claimMessage Mock — wir testen runDiscover() E2E nicht hier
 * (würde den Service-Client mit allen mail_sync_folders mocken müssen).
 *
 * Statt eines vollen E2E-Tests prüfen wir die *Invariante*:
 *   1. Bei N bekannten + M neuen Mails ist messages_claimed = M (nicht N+M)
 *   2. Loop terminiert bei vollem Budget (M = budget)
 *   3. Loop bricht spätestens bei pages_read >= MAX_PAGES_PER_FOLDER ab
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MailMessage } from "@/lib/microsoft-graph/delta";

// Mocks
const mockDeltaSync = vi.fn();
const mockClaimMessage = vi.fn();
const mockMarkBootstrapSkip = vi.fn();

vi.mock("@/lib/microsoft-graph/delta", async (orig) => {
  const actual = await orig<typeof import("@/lib/microsoft-graph/delta")>();
  return {
    ...actual,
    deltaSync: (opts: unknown) => mockDeltaSync(opts),
  };
});
vi.mock("@/lib/email-sync/idempotency", () => ({
  claimMessage: (...args: unknown[]) => mockClaimMessage(...args),
  markBootstrapSkip: (...args: unknown[]) => mockMarkBootstrapSkip(...args),
}));
vi.mock("@/lib/supabase", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () =>
            Promise.resolve({
              data: [
                {
                  id: "f1",
                  graph_folder_id: "GRAPH-F1",
                  folder_name: "in Sachen Rechnungen",
                  folder_path: "Inbox/in Sachen Rechnungen",
                  document_hint: "rechnung",
                  delta_token: "OLD_DELTA_TOKEN", // nicht-bootstrap
                  enabled: true,
                  last_sync_at: null,
                },
              ],
              error: null,
            }),
        }),
      }),
      update: () => ({
        eq: () => Promise.resolve({ data: null, error: null }),
      }),
    }),
  }),
}));
vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

/** Baut Mock-Mail mit eindeutiger ID. */
function makeMsg(idx: number): MailMessage {
  return {
    id: `g-${idx}`,
    internetMessageId: `<msg-${idx}@example.com>`,
    receivedDateTime: new Date(2026, 5, 8, 11, 30, 0).toISOString(),
    subject: `Test ${idx}`,
    bodyPreview: "",
    body: { contentType: "text", content: "" },
    from: { emailAddress: { address: "sender@example.com" } },
    hasAttachments: true,
    parentFolderId: "GRAPH-F1",
  };
}

/** Generator-Factory: 1 Page mit N Mails, dann done mit deltaLink. */
function asyncGen(messages: MailMessage[][]) {
  return (async function* () {
    for (const page of messages) {
      yield page;
    }
    return "NEW_DELTA_TOKEN_FROM_GRAPH";
  })();
}

describe("Discover-Counter Burst-Bug-Fix", () => {
  beforeEach(() => {
    mockDeltaSync.mockReset();
    mockClaimMessage.mockReset();
    mockMarkBootstrapSkip.mockReset();
  });

  it("Burst-Szenario: 100 bekannte + 50 neue Mails → alle 50 neuen werden geclaimet (Counter blockiert nicht)", async () => {
    // 150 Mails in 3 Pages
    const allMessages = Array.from({ length: 150 }, (_, i) => makeMsg(i));
    mockDeltaSync.mockReturnValue(
      asyncGen([
        allMessages.slice(0, 50),
        allMessages.slice(50, 100),
        allMessages.slice(100, 150),
      ]),
    );

    // claim: erste 100 sind "bereits bekannt" (returnt false), Rest neu (true)
    mockClaimMessage.mockImplementation((_supa, input: { internet_message_id: string }) => {
      const idx = Number(input.internet_message_id.match(/msg-(\d+)/)?.[1] ?? -1);
      return Promise.resolve(idx >= 100);
    });

    const { runDiscover } = await import("../discover");
    const result = await runDiscover();

    expect(result.folders).toHaveLength(1);
    const f = result.folders[0];
    expect(f.messages_claimed).toBe(50); // genau die 50 neuen
    expect(f.messages_already_known).toBe(100); // 100 bekannte korrekt gezählt
    expect(f.error).toBeNull();
  });

  it("Bekannte Mails blockieren das Budget NICHT — alle Pages werden gelesen bis deltaLink", async () => {
    // 200 schon-bekannte Mails + 1 neue ganz am Ende
    const allMessages = Array.from({ length: 201 }, (_, i) => makeMsg(i));
    mockDeltaSync.mockReturnValue(
      asyncGen([
        allMessages.slice(0, 50),
        allMessages.slice(50, 100),
        allMessages.slice(100, 150),
        allMessages.slice(150, 200),
        allMessages.slice(200, 201),
      ]),
    );

    mockClaimMessage.mockImplementation((_supa, input: { internet_message_id: string }) => {
      const idx = Number(input.internet_message_id.match(/msg-(\d+)/)?.[1] ?? -1);
      return Promise.resolve(idx === 200); // nur die letzte ist neu
    });

    const { runDiscover } = await import("../discover");
    const result = await runDiscover();

    const f = result.folders[0];
    expect(f.messages_claimed).toBe(1); // die eine neue Mail wurde erreicht
    expect(f.messages_already_known).toBe(200); // alle 200 bekannten gezählt
    expect(f.pages_read).toBe(5); // alle 5 Pages gelesen
  });

  it("Page-Limit greift bei Runaway: bei >MAX_PAGES_PER_FOLDER (20) Pages mit nur bekannten Mails wird abgebrochen", async () => {
    // 30 Pages × 50 Mails = 1500 Mails, alle bekannt, kein deltaLink
    const pages: MailMessage[][] = [];
    for (let p = 0; p < 30; p++) {
      pages.push(Array.from({ length: 50 }, (_, i) => makeMsg(p * 50 + i)));
    }
    // Generator endet ohne return-value → simuliert "kein deltaLink" Edge-Case
    const gen = (async function* (): AsyncGenerator<MailMessage[], string, void> {
      for (const page of pages) yield page;
      return ""; // leerer Token = nicht gespeichert
    })();
    mockDeltaSync.mockReturnValue(gen);
    mockClaimMessage.mockResolvedValue(false); // alle bekannt

    const { runDiscover } = await import("../discover");
    const result = await runDiscover();

    const f = result.folders[0];
    expect(f.pages_read).toBeLessThanOrEqual(20); // Page-Cap respektiert
    expect(f.messages_already_known).toBeGreaterThan(0);
    expect(f.messages_claimed).toBe(0);
  });

  it("Budget greift NUR auf neu geclaimte Mails (Burst gleichzeitig in 1 Folder)", async () => {
    // Pro Page 50 NEUE Mails. Budget = 100 global. Sollte nach 2 Pages stoppen.
    const allMessages = Array.from({ length: 200 }, (_, i) => makeMsg(i));
    mockDeltaSync.mockReturnValue(
      asyncGen([
        allMessages.slice(0, 50),
        allMessages.slice(50, 100),
        allMessages.slice(100, 150),
        allMessages.slice(150, 200),
      ]),
    );
    mockClaimMessage.mockResolvedValue(true); // alle neu

    const { runDiscover } = await import("../discover");
    const result = await runDiscover();

    const f = result.folders[0];
    // MAX_MESSAGES_PER_TICK = 100 — wir stoppen nach genau 100 neuen Claims
    expect(f.messages_claimed).toBe(100);
    // Folder partial → finalDeltaToken null → der Folder-Result trägt diese
    // Info implizit. Die runDiscover.truncated-Flag ist eine outer-loop
    // Eigenschaft die nur greift wenn nach diesem Folder noch andere Folders
    // kämen (Budget aufgebraucht). Mit 1 Folder bleibt sie false — kein Bug.
    expect(f.messages_already_known).toBe(0);
  });
});
