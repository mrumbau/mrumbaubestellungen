/**
 * Gelernte Verwerfungen gelten nur fuer Mails ohne Anhang (08.10.2026).
 *
 * Befund: Nach einer Aufraeumaktion am 13.08. (Bestellungen von Raab-Karcher,
 * Speedmaster, Boettcher verworfen) hat das gelernte Muster
 * "Rechnung von Raab-Karcher, eine Marke der STARK Deutschland GmbH" zwei
 * Monate lang jede echte Rechnung und jeden Lieferschein dieser Lieferanten
 * aussortiert — 35 Mails mit PDF, ohne dass es jemand sah.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockChat = vi.fn();
vi.mock("@/lib/openai", () => ({
  chatCompletion: (params: unknown) => mockChat(params),
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createServiceClient: vi.fn() }));

import { classifyEmailLogic } from "../classify-logic";
import { createServiceClient } from "@/lib/supabase";

const GELERNT = [
  {
    absender_adresse: "ediversand@stark-deutschland.de",
    absender_domain: "stark-deutschland.de",
    email_betreff: "Rechnung von Raab-Karcher, eine Marke der STARK Deutschland GmbH",
  },
  { absender_adresse: "a@stark-deutschland.de", absender_domain: "stark-deutschland.de", email_betreff: "Werbung 1" },
  { absender_adresse: "b@stark-deutschland.de", absender_domain: "stark-deutschland.de", email_betreff: "Werbung 2" },
];

function makeSupabase() {
  const from = vi.fn((table: string) => {
    if (table === "verworfene_emails") {
      return {
        select: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: GELERNT, error: null }) }),
        }),
      };
    }
    return { select: () => Promise.resolve({ data: [], error: null }) };
  });
  return { from };
}

function antwort(relevant: boolean) {
  return { choices: [{ message: { content: JSON.stringify({ relevant, grund: "test" }) } }] };
}

describe("Gelernte Verwerfungen und Anhaenge", () => {
  beforeEach(() => {
    mockChat.mockReset();
    vi.mocked(createServiceClient).mockReset();
  });

  it("Rechnung mit PDF von einem 'gelernten' Absender wird NICHT aussortiert", async () => {
    const supabase = makeSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supabase as never);
    mockChat.mockResolvedValue(antwort(true));
    const r = await classifyEmailLogic({
      email_absender: "EDIVersand@stark-deutschland.de",
      email_betreff: "Rechnung von Raab-Karcher, eine Marke der STARK Deutschland GmbH",
      email_vorschau: "Anbei Ihre Rechnung.",
      hat_anhaenge: true,
    });
    expect(r.grund).not.toBe("gelernt_verworfen");
    expect(r.grund).not.toBe("domain_oft_verworfen");
    expect(r.relevant).toBe(true);
    // Die gelernten Muster werden fuer Mails mit Anhang gar nicht erst geladen.
    expect(supabase.from).not.toHaveBeenCalledWith("verworfene_emails");
  });

  it("dieselbe Mail OHNE Anhang bleibt gelernt verworfen", async () => {
    const supabase = makeSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supabase as never);
    const r = await classifyEmailLogic({
      email_absender: "EDIVersand@stark-deutschland.de",
      email_betreff: "Rechnung von Raab-Karcher, eine Marke der STARK Deutschland GmbH",
      email_vorschau: "",
      hat_anhaenge: false,
    });
    expect(r.relevant).toBe(false);
    expect(r.grund).toBe("gelernt_verworfen");
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("Domain mit drei Verwerfungen: ohne Anhang aussortiert, mit Anhang nicht", async () => {
    const supabase = makeSupabase();
    vi.mocked(createServiceClient).mockReturnValue(supabase as never);
    const ohne = await classifyEmailLogic({
      email_absender: "neu@stark-deutschland.de",
      email_betreff: "Aktionsangebot Oktober",
      email_vorschau: "",
      hat_anhaenge: false,
    });
    expect(ohne.grund).toBe("domain_oft_verworfen");

    mockChat.mockResolvedValue(antwort(true));
    const mit = await classifyEmailLogic({
      email_absender: "neu@stark-deutschland.de",
      email_betreff: "Digitaler Lieferschein 2031329241",
      email_vorschau: "",
      hat_anhaenge: true,
    });
    expect(mit.grund).not.toBe("domain_oft_verworfen");
  });
});
