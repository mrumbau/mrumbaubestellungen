/**
 * Tests für den adversarialen Second-Pass Review.
 *
 * Mockt nur `chatCompletion` aus client.ts — die restliche Logik (Validation,
 * Confidence-Gating, Fail-Closed) wird vollständig durchgetestet.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSecondReview, SECOND_REVIEW_MODEL } from "../second-review";

const mockChat = vi.fn();

vi.mock("../../openai/client", () => ({
  chatCompletion: (params: unknown) => mockChat(params),
  safeParseGptJson: <T>(text: string, fallback: T) => {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return fallback;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return fallback;
    }
  },
}));

vi.mock("../../logger", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

function makeCompletion(content: string) {
  return { choices: [{ message: { content } }] };
}

const baseInput = {
  email_absender: "p.mehringer@engelhard-holz-boden.de",
  email_betreff: "RE MR015 109562",
  email_vorschau: "RECHNUNG ...",
  first_pass_grund: "processed_kein_bestellung",
  anhang_count: 1,
};

describe("runSecondReview", () => {
  beforeEach(() => {
    mockChat.mockReset();
  });

  it("agreed_irrelevant=true bei eindeutig irrelevant", async () => {
    mockChat.mockResolvedValue(
      makeCompletion(
        JSON.stringify({
          verdict: "irrelevant_bestaetigt",
          reason: "Newsletter-Mail ohne Geschäftsbezug",
          confidence: 0.9,
        }),
      ),
    );

    const result = await runSecondReview(baseInput);
    expect(result.agreed_irrelevant).toBe(true);
    expect(result.verdict).toBe("irrelevant_bestaetigt");
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.model).toBe(SECOND_REVIEW_MODEL);
    expect(result.vermuteter_typ).toBeNull();
  });

  it("agreed_irrelevant=false bei hoher Confidence-Disagreement", async () => {
    mockChat.mockResolvedValue(
      makeCompletion(
        JSON.stringify({
          verdict: "vermutlich_dokument",
          reason: "Engelhard-Sender + RE-Subject mit MR015 → wahrscheinlich Rechnung",
          confidence: 0.85,
          vermuteter_typ: "rechnung",
        }),
      ),
    );

    const result = await runSecondReview(baseInput);
    expect(result.agreed_irrelevant).toBe(false);
    expect(result.verdict).toBe("vermutlich_dokument");
    expect(result.vermuteter_typ).toBe("rechnung");
  });

  it("Confidence-Gate: niedrige Confidence bei Disagreement → Drop bestätigt (vermeidet false-positive-Re-Runs)", async () => {
    mockChat.mockResolvedValue(
      makeCompletion(
        JSON.stringify({
          verdict: "vermutlich_dokument",
          reason: "vielleicht ja, vielleicht nein",
          confidence: 0.4,
          vermuteter_typ: "rechnung",
        }),
      ),
    );

    const result = await runSecondReview(baseInput);
    // Trotz "vermutlich_dokument" → wegen Confidence < 0.6 → final irrelevant_bestaetigt
    expect(result.agreed_irrelevant).toBe(true);
    expect(result.verdict).toBe("irrelevant_bestaetigt");
    expect(result.vermuteter_typ).toBeNull();
  });

  it("Default-Werte bei kaputtem JSON: agreed_irrelevant=true (fail-closed)", async () => {
    mockChat.mockResolvedValue(makeCompletion("nicht-json"));

    const result = await runSecondReview(baseInput);
    expect(result.agreed_irrelevant).toBe(true);
    expect(result.confidence).toBe(0.5);
  });

  it("Out-of-range confidence wird auf Default 0.5 geclampt", async () => {
    mockChat.mockResolvedValue(
      makeCompletion(
        JSON.stringify({ verdict: "irrelevant_bestaetigt", reason: "x", confidence: 2.7 }),
      ),
    );

    const result = await runSecondReview(baseInput);
    expect(result.confidence).toBe(0.5);
  });

  it("reason wird auf 500 Zeichen gekürzt", async () => {
    const longReason = "a".repeat(800);
    mockChat.mockResolvedValue(
      makeCompletion(
        JSON.stringify({ verdict: "irrelevant_bestaetigt", reason: longReason, confidence: 0.7 }),
      ),
    );

    const result = await runSecondReview(baseInput);
    expect(result.reason.length).toBeLessThanOrEqual(500);
  });

  it("OpenAI-Throw → throwt selber (fail-closed im Caller)", async () => {
    mockChat.mockRejectedValue(new Error("openai_timeout"));
    await expect(runSecondReview(baseInput)).rejects.toThrow(/second_review_openai_fail/);
  });

  it("user payload contains all relevant fields (Defense-in-Depth)", async () => {
    mockChat.mockResolvedValue(
      makeCompletion(JSON.stringify({ verdict: "irrelevant_bestaetigt", confidence: 0.9 })),
    );

    await runSecondReview(baseInput);

    expect(mockChat).toHaveBeenCalledTimes(1);
    const params = mockChat.mock.calls[0][0];
    const userMessage = params.messages[1].content as string;
    expect(userMessage).toContain("p.mehringer@engelhard-holz-boden.de");
    expect(userMessage).toContain("RE MR015 109562");
    expect(userMessage).toContain("processed_kein_bestellung");
    // payload als json embedded — Vorschau muss escaped sein
    expect(userMessage).toContain("\"anzahl_anhaenge\":1");
  });

  it("Vorschau wird auf 600 Zeichen gekürzt im Payload", async () => {
    mockChat.mockResolvedValue(
      makeCompletion(JSON.stringify({ verdict: "irrelevant_bestaetigt", confidence: 0.9 })),
    );

    const long = "x".repeat(1200);
    await runSecondReview({ ...baseInput, email_vorschau: long });

    const params = mockChat.mock.calls[0][0];
    const userMessage = params.messages[1].content as string;
    // Suche das vorschau-Feld im JSON
    const match = userMessage.match(/"vorschau":"(x+)"/);
    expect(match).not.toBeNull();
    expect((match![1] ?? "").length).toBeLessThanOrEqual(600);
  });
});
