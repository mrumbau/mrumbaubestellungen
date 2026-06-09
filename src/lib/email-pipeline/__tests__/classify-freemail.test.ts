/**
 * Tests für den Freemail-Inhalts-Override (09.06.2026, Version 2).
 *
 * Wurzel-Bug: Freemail-Domains (t-online.de, gmail.com, gmx.de, …) wurden
 * pauschal als „irrelevant" gedroppt, OHNE Subject/Vorschau zu prüfen.
 * glas-gebhardt@t-online.de mit „Rechnung 123329 - Mahnung" fiel deshalb
 * durch — obwohl Solo-Selbständige (Glaser, Maler) Rechnungen üblicherweise
 * von Freemail-Accounts senden.
 *
 * Fix v2 (eng auf Zahlungs-Welt): vor dem Drop wird Subject + Vorschau
 * auf Rechnungs-/Mahn-/Zahlungs-/Gutschrift-/Lieferschein-Signale geprüft.
 * Bestellung/Bestellbestätigung/Auftrag/Angebot bewusst NICHT enthalten —
 * würden eine Flut normaler Webshop-Mails durch Freemail erzeugen.
 *
 * Tests-Strategie: chatCompletion + createServiceClient mocken, so dass
 * wir den Pfad bis ZUR Freemail-Stufe deterministisch erreichen können.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockChat = vi.fn();

vi.mock("@/lib/openai", () => ({
  chatCompletion: (params: unknown) => mockChat(params),
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

/**
 * Minimaler Supabase-Mock: alle relevanten Tabellen-Queries werden mit
 * leeren Listen befriedigt, sodass die Pipeline an Stufe 7 (Freemail)
 * ankommt. Wenn ein Test ein anderes Match braucht (z.B. SU-Treffer
 * vorab), kann er den Mock pro-Test overriden.
 */
function makeSupabase(overrides: {
  haendler?: Array<{ id: string; name: string; domain: string | null; email_absender: string[] | null }>;
  subunternehmer?: Array<{ id: string; firma: string; email_absender: string[] | null }>;
  blacklist?: Array<{ muster: string; typ: string }>;
  verworfene?: Array<{ absender_adresse: string; absender_domain: string; email_betreff: string }>;
} = {}) {
  const from = vi.fn((table: string) => {
    if (table === "email_blacklist") {
      return {
        select: () => Promise.resolve({ data: overrides.blacklist ?? [], error: null }),
      };
    }
    if (table === "verworfene_emails") {
      return {
        select: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: overrides.verworfene ?? [], error: null }),
          }),
        }),
      };
    }
    if (table === "haendler") {
      return {
        select: () => Promise.resolve({ data: overrides.haendler ?? [], error: null }),
      };
    }
    if (table === "subunternehmer") {
      return {
        select: () => Promise.resolve({ data: overrides.subunternehmer ?? [], error: null }),
      };
    }
    // Default: leerer Datenpfad
    return {
      select: () => Promise.resolve({ data: [], error: null }),
    };
  });
  return { from };
}

vi.mock("@/lib/supabase", () => ({
  createServiceClient: vi.fn(),
}));

import { classifyEmailLogic } from "../classify-logic";
import { createServiceClient } from "@/lib/supabase";

function makeChatCompletion(relevant: boolean, grund: string) {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({ relevant, grund }),
        },
      },
    ],
  };
}

describe("Freemail-Inhalts-Override (Bug-Fix 09.06.2026)", () => {
  beforeEach(() => {
    mockChat.mockReset();
    vi.mocked(createServiceClient).mockReset();
  });

  it("glas-gebhardt@t-online.de + 'Rechnung 123329 - Mahnung' → NICHT freemail", async () => {
    const supabase = makeSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supabase as never);
    // GPT entscheidet relevant (klares Geschäftsdokument)
    mockChat.mockResolvedValue(makeChatCompletion(true, "Rechnung mit Mahnung erkannt"));

    const result = await classifyEmailLogic({
      email_absender: "glas-gebhardt@t-online.de",
      email_betreff: "Rechnung 123329 - Mahnung",
      email_vorschau: "Sehr geehrte Damen und Herren, anbei die Rechnung Nr. 123329 ...",
      hat_anhaenge: true,
    });

    expect(result.grund).not.toBe("freemail");
    expect(result.relevant).toBe(true);
    expect(result.grund).toBe("ki_ja");
  });

  it("t-online.de ohne kaufmännisches Signal bleibt freemail/irrelevant", async () => {
    const supabase = makeSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supabase as never);

    const result = await classifyEmailLogic({
      email_absender: "max.mueller@t-online.de",
      email_betreff: "Hallo wie geht's",
      email_vorschau: "Servus, lange nicht gehört. Wollen uns mal treffen?",
      hat_anhaenge: false,
    });

    expect(result.relevant).toBe(false);
    expect(result.grund).toBe("freemail");
    // GPT wurde nicht aufgerufen → kein Cost
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("gmail.com + 'Lieferschein' → wird durchgelassen zur GPT-Stufe", async () => {
    const supabase = makeSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supabase as never);
    mockChat.mockResolvedValue(makeChatCompletion(true, "Lieferschein angekündigt"));

    const result = await classifyEmailLogic({
      email_absender: "trockenbau-meier@gmail.com",
      email_betreff: "Lieferschein für Baustelle Müllerstr. 12",
      email_vorschau: "anbei der Lieferschein",
      hat_anhaenge: true,
    });

    expect(result.grund).not.toBe("freemail");
    expect(result.relevant).toBe(true);
  });

  it("gmx.de + 'Angebot' OHNE Anhang bleibt freemail (Angebote sind nicht im Override-Scope)", async () => {
    const supabase = makeSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supabase as never);

    const result = await classifyEmailLogic({
      email_absender: "info-aktion@gmx.de",
      email_betreff: "Tolles Angebot heute nur für Sie!",
      email_vorschau: "Sparen Sie 50% auf …",
      hat_anhaenge: false,
    });

    expect(result.relevant).toBe(false);
    expect(result.grund).toBe("freemail");
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("gmx.de + 'Angebot' MIT Anhang bleibt freemail (Angebote bewusst nicht im Override-Scope)", async () => {
    // Härtung 09.06.2026 v2: Angebote, Bestellungen, Aufträge sind KEIN
    // ausreichender Grund zum Override. Sonst würden Webshop-Bestellbestäti-
    // gungen über Freemail-Domains massenhaft im Bestellwesen landen.
    const supabase = makeSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supabase as never);

    const result = await classifyEmailLogic({
      email_absender: "elektro-schmidt@gmx.de",
      email_betreff: "Unser Angebot für Bauvorhaben",
      email_vorschau: "anbei das Angebot, gültig 30 Tage",
      hat_anhaenge: true,
    });

    expect(result.relevant).toBe(false);
    expect(result.grund).toBe("freemail");
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("Freemail + 'Bestellbestätigung' bleibt freemail (Bestellungen sind nicht im Override-Scope)", async () => {
    // Härtung 09.06.2026 v2: Bestellbestätigungen würden bei der Webshop-
    // Welle ein Volumenproblem erzeugen. „In Sachen Rechnungen" soll
    // Rechnungen verarbeiten, nicht Bestellbestätigungen.
    const supabase = makeSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supabase as never);

    const result = await classifyEmailLogic({
      email_absender: "shop@gmx.de",
      email_betreff: "Ihre Bestellbestätigung #12345",
      email_vorschau: "vielen Dank für Ihre Bestellung",
      hat_anhaenge: true,
    });

    expect(result.relevant).toBe(false);
    expect(result.grund).toBe("freemail");
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("Freemail + 'Auftragsbestätigung' bleibt freemail (nicht im Override-Scope)", async () => {
    const supabase = makeSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supabase as never);

    const result = await classifyEmailLogic({
      email_absender: "kunde@web.de",
      email_betreff: "Auftragsbestätigung für die Renovierung",
      email_vorschau: "anbei die Auftragsbestätigung",
      hat_anhaenge: true,
    });

    expect(result.relevant).toBe(false);
    expect(result.grund).toBe("freemail");
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("t-online.de + 'Newsletter' bleibt freemail/irrelevant", async () => {
    const supabase = makeSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supabase as never);

    const result = await classifyEmailLogic({
      email_absender: "newsletter@t-online.de",
      email_betreff: "Ihr T-Online Newsletter Juni",
      email_vorschau: "Diese Woche im Angebot ...",
      hat_anhaenge: false,
    });

    // 'newsletter' im Subject → SYSTEM_KEYWORDS-Treffer (Stufe 2),
    // landet als system_mail. Aber wichtig: KEIN ki_ja.
    expect(result.relevant).toBe(false);
    expect(["system_mail", "freemail"]).toContain(result.grund);
  });

  it("gmx.de + 'Werbung' (kein Hard/Weich-Signal) bleibt freemail", async () => {
    const supabase = makeSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supabase as never);

    const result = await classifyEmailLogic({
      email_absender: "spam@gmx.de",
      email_betreff: "Sparen Sie jetzt 50% auf alle Produkte",
      email_vorschau: "Limited time offer",
      hat_anhaenge: false,
    });

    expect(result.relevant).toBe(false);
    expect(result.grund).toBe("freemail");
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("Hard-Signal 'zahlungserinnerung' wird ebenfalls geprüft", async () => {
    const supabase = makeSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supabase as never);
    mockChat.mockResolvedValue(makeChatCompletion(true, "Zahlungserinnerung"));

    const result = await classifyEmailLogic({
      email_absender: "handwerker@web.de",
      email_betreff: "Zahlungserinnerung Auftrag 2026/05",
      email_vorschau: "wir bitten höflich um Begleichung",
      hat_anhaenge: false,
    });

    expect(result.grund).not.toBe("freemail");
    expect(result.relevant).toBe(true);
  });

  it("Hard-Signal in Vorschau (nicht Subject) zählt auch", async () => {
    const supabase = makeSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supabase as never);
    mockChat.mockResolvedValue(makeChatCompletion(true, "Rechnung in Vorschau"));

    const result = await classifyEmailLogic({
      email_absender: "kontakt@gmail.com",
      email_betreff: "Hinweis von Hr. Müller",
      email_vorschau: "Sehr geehrte Damen und Herren, anbei meine Rechnung Nr. 22",
      hat_anhaenge: true,
    });

    expect(result.grund).not.toBe("freemail");
    expect(result.relevant).toBe(true);
  });

  it("GPT sagt nein bei Freemail-Override → Mail wird trotzdem irrelevant, aber mit ki_nein nicht freemail", async () => {
    const supabase = makeSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supabase as never);
    // GPT entscheidet trotzdem irrelevant (z.B. Marketing-Mail die zufällig „Rechnung-Vorlage" enthält)
    mockChat.mockResolvedValue(makeChatCompletion(false, "Marketing-Email"));

    const result = await classifyEmailLogic({
      email_absender: "spam@gmail.com",
      email_betreff: "Kostenlose Rechnung-Vorlage zum Download",
      email_vorschau: "Werbung Sommeraktion",
      hat_anhaenge: true,
    });

    expect(result.relevant).toBe(false);
    expect(result.grund).toBe("ki_nein");
    // Wichtig: nicht „freemail" — der KI-Pfad hat entschieden, nicht der Domain-Drop
  });
});
