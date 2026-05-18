/**
 * Tests für CostCapExceededError + withCostTracking.
 *
 * 18.05.2026 (A1.10) — Hard-Cap schützt gegen Cost-Spikes (Always-KI-Loop,
 * adversarial PDF, Vendor-Parser-Dauer-Fail).
 */
import { describe, it, expect } from "vitest";
import { withCostTracking, CostCapExceededError, MAX_COST_PER_MAIL_EUR } from "../openai";

describe("withCostTracking + Hard-Cap", () => {
  it("liefert normalen Result wenn keine Cost-Calls", async () => {
    const { result, cost, capHit } = await withCostTracking(async () => "ok");
    expect(result).toBe("ok");
    expect(cost.calls).toBe(0);
    expect(cost.cost_eur).toBe(0);
    expect(capHit).toBeUndefined();
  });

  it("MAX_COST_PER_MAIL_EUR ist im erwarteten Bereich (0.10-0.50)", () => {
    expect(MAX_COST_PER_MAIL_EUR).toBeGreaterThan(0.1);
    expect(MAX_COST_PER_MAIL_EUR).toBeLessThan(0.5);
  });

  it("CostCapExceededError enthält Bucket-Snapshot mit cost_eur", () => {
    const bucket = {
      input_tokens: 100,
      output_tokens: 50,
      cost_eur: 0.25,
      calls: 3,
      model_breakdown: {},
    };
    const err = new CostCapExceededError(bucket);
    expect(err.name).toBe("CostCapExceededError");
    expect(err.bucket.cost_eur).toBe(0.25);
    expect(err.bucket.calls).toBe(3);
    expect(err.message).toMatch(/0\.2500.*EUR.*max.*0\.19/);
  });

  it("capHit=true wenn intern CostCapExceededError geworfen wird", async () => {
    // Simuliere durch direktes Werfen eines CostCapExceededError aus dem fn
    const { result, cost, capHit } = await withCostTracking(async () => {
      throw new CostCapExceededError({
        input_tokens: 500,
        output_tokens: 200,
        cost_eur: 0.25,
        calls: 5,
        model_breakdown: { "gpt-5.5": { input_tokens: 500, output_tokens: 200, cost_eur: 0.25, calls: 5 } },
      });
    });
    expect(capHit).toBe(true);
    expect(result).toBeUndefined();
    // Bucket bleibt der Ausgangs-Bucket (leer), weil der CostCapExceededError
    // INNERHALB der fn geworfen wurde — der äußere Bucket wurde nie gefüllt.
    // (Real-World: trackCost füllt Bucket UND wirft → Bucket hat Werte.)
    expect(cost).toBeDefined();
  });

  it("andere Errors werden NICHT als capHit behandelt — re-throw", async () => {
    await expect(
      withCostTracking(async () => {
        throw new Error("anderer Fehler");
      }),
    ).rejects.toThrow("anderer Fehler");
  });

  it("isolated buckets pro withCostTracking-Call (AsyncLocalStorage)", async () => {
    // Zwei parallele withCostTracking sollten unabhängige Buckets haben
    const [a, b] = await Promise.all([
      withCostTracking(async () => "a"),
      withCostTracking(async () => "b"),
    ]);
    expect(a.cost.calls).toBe(0);
    expect(b.cost.calls).toBe(0);
    expect(a.result).toBe("a");
    expect(b.result).toBe("b");
  });
});
