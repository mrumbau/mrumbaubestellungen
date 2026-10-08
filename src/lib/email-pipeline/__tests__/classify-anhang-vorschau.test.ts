/**
 * Bei Mails mit Anhang zaehlen Fusstexte nicht (08.10.2026).
 *
 * Rechnungsmails tragen in der Vorschau Saetze wie "Newsletter abmelden"
 * oder "Jetzt bewerten". Dadurch fielen Telekom-Rechnungen als Systemmail und
 * Dewetech-Rechnungen als Werbung durch — obwohl Betreff und PDF eindeutig
 * waren. Ohne Anhang bleibt die Vorschau ein gueltiges Signal.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockChat = vi.fn();
vi.mock("@/lib/openai", () => ({ chatCompletion: (params: unknown) => mockChat(params) }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createServiceClient: vi.fn() }));

import { classifyEmailLogic } from "../classify-logic";
import { createServiceClient } from "@/lib/supabase";

function makeSupabase(haendler: Array<{ id: string; name: string; domain: string | null; email_absender: string[] | null }> = []) {
  const from = vi.fn((table: string) => {
    if (table === "verworfene_emails") {
      return { select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) };
    }
    if (table === "haendler") return { select: () => Promise.resolve({ data: haendler, error: null }) };
    return { select: () => Promise.resolve({ data: [], error: null }) };
  });
  return { from };
}

const DEWETECH = [{ id: "h1", name: "Dewetech", domain: "dewetech.de", email_absender: ["re.ausgang@dewetech.de"] }];

describe("Vorschau zaehlt nur ohne Anhang", () => {
  beforeEach(() => {
    mockChat.mockReset();
    vi.mocked(createServiceClient).mockReset();
  });

  it("Rechnung mit PDF und 'Newsletter abmelden' im Fusstext ist keine Systemmail", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeSupabase() as never);
    mockChat.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ relevant: true, grund: "ok" }) } }] });
    const r = await classifyEmailLogic({
      email_absender: "rechnungonline@telekom.de",
      email_betreff: "Ihre Telekom Festnetz Rechnung Oktober 2026",
      email_vorschau: "Ihre Rechnung liegt bei. Newsletter abmelden: Klicken Sie hier.",
      hat_anhaenge: true,
    });
    expect(r.grund).not.toBe("system_mail");
  });

  it("dieselbe Mail OHNE Anhang bleibt Systemmail", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeSupabase() as never);
    const r = await classifyEmailLogic({
      email_absender: "rechnungonline@telekom.de",
      email_betreff: "Ihre Telekom Festnetz Rechnung Oktober 2026",
      email_vorschau: "Newsletter abmelden: Klicken Sie hier.",
      hat_anhaenge: false,
    });
    expect(r.grund).toBe("system_mail");
  });

  it("Haendler-Rechnung mit PDF und 'jetzt bewerten' im Fusstext ist keine Werbung", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeSupabase(DEWETECH) as never);
    mockChat.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ relevant: true, grund: "ok" }) } }] });
    const r = await classifyEmailLogic({
      email_absender: "re.ausgang@dewetech.de",
      email_betreff: "RE-Nr. 526166307 BE-Nr. HANSA FERTIGSET",
      email_vorschau: "Anbei Ihre Rechnung. Jetzt bewerten und Feedback geben!",
      hat_anhaenge: true,
    });
    expect(r.grund).not.toBe("haendler_marketing");
    expect(r.relevant).toBe(true);
  });

  it("Haendler-Werbung ohne Anhang bleibt Werbung", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeSupabase(DEWETECH) as never);
    const r = await classifyEmailLogic({
      email_absender: "news@dewetech.de",
      email_betreff: "Unsere Aktion",
      email_vorschau: "20 % auf alles, jetzt Gutschein sichern",
      hat_anhaenge: false,
    });
    expect(r.grund).toBe("haendler_marketing");
  });
});
