/**
 * Antwortbudget der Dokumentanalyse (10.10.2026).
 *
 * Befund: 2000 Token reichten nicht fuer Schema plus Volltext plus die
 * Denk-Token von gpt-5.5. Mehrseitige Rechnungen endeten bei beiden
 * Modellen mit "length limit was reached" und damit als parse_fehler —
 * 32 von 351 Belegen in zehn Wochen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const parseMock = vi.fn();
vi.mock("../client", () => ({
  openai: { chat: { completions: { parse: (...args: unknown[]) => parseMock(...args) } } },
  withRetry: (fn: () => Promise<unknown>) => fn(),
  chatCompletion: vi.fn(),
  safeParseGptJson: vi.fn(),
  modelDisallowsCustomTemperature: (m: string) => m.startsWith("gpt-5"),
}));
vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { analysiereDokument, MAX_ANTWORT_TOKEN } from "../dokument";

const ANTWORT = {
  choices: [{ message: { parsed: { typ: "rechnung", gesamtbetrag: 119, konfidenz: 0.9, parse_fehler: false } } }],
};

describe("analysiereDokument — Antwortbudget", () => {
  beforeEach(() => parseMock.mockReset().mockResolvedValue(ANTWORT));

  it("gibt einem PDF beim Hauptmodell das volle Budget als max_completion_tokens", async () => {
    await analysiereDokument(Buffer.from("%PDF-1.4 " + "x".repeat(200)).toString("base64"), "application/pdf");
    const params = parseMock.mock.calls[0][0] as Record<string, unknown>;
    expect(params.model).toBe("gpt-5.5");
    expect(params.max_completion_tokens).toBe(MAX_ANTWORT_TOKEN);
    expect(params.max_tokens).toBeUndefined();
    expect(MAX_ANTWORT_TOKEN).toBeGreaterThanOrEqual(6000);
  });

  it("gibt dem Ersatzmodell dasselbe Budget als max_tokens", async () => {
    parseMock.mockResolvedValueOnce({ choices: [{ message: { parsed: null, refusal: null } }] });
    await analysiereDokument(Buffer.from("%PDF-1.4 " + "x".repeat(200)).toString("base64"), "application/pdf");
    expect(parseMock).toHaveBeenCalledTimes(2);
    const fallback = parseMock.mock.calls[1][0] as Record<string, unknown>;
    expect(fallback.model).toBe("gpt-4o");
    expect(fallback.max_tokens).toBe(MAX_ANTWORT_TOKEN);
  });

  it("bei reinem Text haengt das Budget an der Eingabe, mindestens 1500, hoechstens das Maximum", async () => {
    await analysiereDokument(Buffer.from("kurzer Text").toString("base64"), "text/plain");
    const klein = parseMock.mock.calls[0][0] as Record<string, unknown>;
    expect(klein.max_completion_tokens).toBe(1500);

    parseMock.mockClear().mockResolvedValue(ANTWORT);
    await analysiereDokument(Buffer.from("y".repeat(100_000)).toString("base64"), "text/plain");
    const gross = parseMock.mock.calls[0][0] as Record<string, unknown>;
    expect(gross.max_completion_tokens).toBe(MAX_ANTWORT_TOKEN);
  });

  it("der Prompt begrenzt den Volltext, damit das Budget reicht", async () => {
    await analysiereDokument(Buffer.from("%PDF-1.4 " + "x".repeat(200)).toString("base64"), "application/pdf");
    const params = parseMock.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const system = params.messages.find((m) => m.role === "system")?.content ?? "";
    expect(system).toMatch(/volltext.*6000 Zeichen/);
  });
});
