/**
 * Cost-Tracking-Layer für alle OpenAI-Calls.
 *
 * Jeder Call schreibt sein Cost-Profil entweder in einen request-scoped
 * AsyncLocalStorage-Bucket (wenn der Caller `withCostTracking()` nutzt) ODER
 * als logInfo-Eintrag (Per-Call-Visibility in Vercel-Function-Logs).
 *
 * 19.05.2026 (A2.7) — aus openai.ts extrahiert. Verhalten unverändert.
 *
 * Per-Mail-Aggregation in `email_processing_log.openai_*` setzt voraus, dass
 * classify.ts/ingest.ts direkten Lib-Call statt HTTP-Loopback machen
 * (Phase-2b-Backlog). Bis dahin: Per-Call-Logs sind unsere Cost-Diagnose.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { logError, logInfo } from "@/lib/logger";

export interface CostBucket {
  input_tokens: number;
  output_tokens: number;
  cost_eur: number;
  calls: number;
  model_breakdown: Record<string, { input_tokens: number; output_tokens: number; cost_eur: number; calls: number }>;
}

/** USD pro 1M Tokens. Stand 2026-05. Anpassen wenn OpenAI-Preise ändern. */
export const MODEL_COSTS_USD: Record<string, { input: number; output: number }> = {
  // Email-Pipeline (Reasoning für Multi-Doc-Logik)
  "gpt-5.5": { input: 5.00, output: 30.00 },
  "gpt-5.5-pro": { input: 30.00, output: 180.00 },
  // CardScan (kein Reasoning nötig, json_schema strict garantiert Struktur)
  "gpt-5-mini": { input: 0.25, output: 2.00 },
  "gpt-5-nano": { input: 0.05, output: 0.40 },
  // Legacy — bleiben für Cost-Calc historischer Mails (vor Migration verarbeitet)
  "gpt-4o": { input: 2.50, output: 10.00 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
};

/** Grobe USD→EUR-Konversion. Bei Bedarf pro Quartal aktualisieren. */
export const USD_TO_EUR = 0.93;

/**
 * Hard-Cap pro Mail-Verarbeitung. Bei Überschreitung wird die Pipeline mit
 * einer CostCapExceededError abgebrochen — eine fehlgeleitete KI-Welle kann
 * dann maximal MAX_COST_PER_MAIL_EUR pro Mail verbrennen.
 *
 * 18.05.2026 (A1.10) — Schutzschicht gegen Cost-Spikes (z.B. wenn ein
 * Vendor-Parser dauer-fail't und Always-KI-Mode 10× Retry macht, oder ein
 * adversarial PDF die KI in eine Loop tricks't).
 */
export const MAX_COST_PER_MAIL_EUR = 0.19;

export class CostCapExceededError extends Error {
  constructor(public readonly bucket: CostBucket) {
    super(`Cost-Cap überschritten: ${bucket.cost_eur.toFixed(4)} EUR (max ${MAX_COST_PER_MAIL_EUR} EUR, ${bucket.calls} calls)`);
    this.name = "CostCapExceededError";
  }
}

const costStore = new AsyncLocalStorage<CostBucket>();

/**
 * Normalisiert Model-Namen. OpenAI returnt versionierte Namen wie
 * "gpt-5.5-2026-04-15" oder "gpt-4o-2024-08-06" — unsere MODEL_COSTS_USD-Map
 * hat aber nur die Base-Namen. Ohne Normalisierung wäre cost_eur immer 0.
 *
 * Strategie: längster Base-Namens-Match-Prefix gewinnt.
 */
function normalizeModelName(model: string): string {
  // Sortiere keys nach Länge (längster zuerst), damit "gpt-4o-mini" vor "gpt-4o" matched
  const keys = Object.keys(MODEL_COSTS_USD).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (model === key || model.startsWith(key + "-") || model.startsWith(key + ".")) {
      return key;
    }
  }
  return model;
}

function calcCostEur(model: string, prompt_tokens: number, completion_tokens: number): number {
  const normalized = normalizeModelName(model);
  const rates = MODEL_COSTS_USD[normalized] ?? { input: 0, output: 0 };
  const usd = (prompt_tokens * rates.input + completion_tokens * rates.output) / 1_000_000;
  return usd * USD_TO_EUR;
}

/**
 * Interne API: wird ausschließlich von `client.ts/withRetry()` aufgerufen,
 * nachdem eine ChatCompletion-Response sichtbar wird. Wirft CostCapExceededError
 * sobald der aggregate Bucket > MAX_COST_PER_MAIL_EUR.
 */
export function trackCost(
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number } | null | undefined,
) {
  const bucket = costStore.getStore();

  if (!bucket) {
    // Pipeline-Aufrufer hat kein withCostTracking gewickelt — nur Per-Call-Log.
    // Sollte normalerweise nicht passieren (replay.ts wickelt classify+ingest in withCostTracking).
    logInfo("openai/cost-debug", "trackCost: kein AsyncLocalStorage-bucket — Aufrufer ohne withCostTracking?", {
      model,
      has_usage: !!usage,
    });
    return;
  }

  if (!usage) {
    // KI-Call kam zurück ohne usage-Feld (Stream-Response, Error-Response, oder API-Quirk).
    // Mindestens den Call-Counter inkrementieren damit wir sehen DASS gerufen wurde.
    bucket.calls += 1;
    logInfo("openai/cost-debug", "trackCost: usage fehlte — nur Call-Counter inkrementiert", { model });
    return;
  }

  const inputT = usage.prompt_tokens ?? 0;
  const outputT = usage.completion_tokens ?? 0;
  const costEur = calcCostEur(model, inputT, outputT);
  // Versionierten Model-Namen für Breakdown-Key zu Base-Namen normalisieren —
  // sonst entstehen 100 Sub-Keys pro Modell-Release-Datum.
  const breakdownKey = normalizeModelName(model);

  bucket.input_tokens += inputT;
  bucket.output_tokens += outputT;
  bucket.cost_eur += costEur;
  bucket.calls += 1;
  const mb = (bucket.model_breakdown[breakdownKey] ??= { input_tokens: 0, output_tokens: 0, cost_eur: 0, calls: 0 });
  mb.input_tokens += inputT;
  mb.output_tokens += outputT;
  mb.cost_eur += costEur;
  mb.calls += 1;

  // Wenn beide 0 sind: log für Diagnose (bei 0-Token-Result wäre das ungewöhnlich)
  if (inputT === 0 && outputT === 0) {
    logInfo("openai/cost-debug", "trackCost: beide Token-Counter sind 0", { model, usage });
  }

  // 18.05.2026 (A1.10) — Hard-Cap: nach jedem Call prüfen ob Bucket > Schwelle
  if (bucket.cost_eur > MAX_COST_PER_MAIL_EUR) {
    throw new CostCapExceededError(bucket);
  }
}

/**
 * Wrappt einen Block aus mehreren OpenAI-Calls + akkumuliert die Costs.
 * Liefert Result + aggregierten Cost-Bucket. Caller schreibt z.B. in
 * `email_processing_log` oder ein Cost-Audit-Log.
 *
 * Funktioniert nur In-Process — HTTP-Loopback (siehe classify.ts/ingest.ts)
 * durchquert die Async-Local-Storage-Grenze. Für die Email-Pipeline daher
 * heute keine Per-Mail-Aggregation; siehe Phase-2b-Refactor.
 */
export async function withCostTracking<T>(fn: () => Promise<T>): Promise<{ result: T; cost: CostBucket; capHit?: boolean }> {
  const bucket: CostBucket = {
    input_tokens: 0,
    output_tokens: 0,
    cost_eur: 0,
    calls: 0,
    model_breakdown: {},
  };
  try {
    const result = await costStore.run(bucket, fn);
    return { result, cost: bucket };
  } catch (err) {
    // 18.05.2026 (A1.10) — Cost-Cap-Abort speziell behandeln: Bucket-Snapshot
    // trotzdem zurückgeben damit Caller die teilweise gesammelten Costs in
    // email_processing_log persistieren kann. Caller muss `capHit` checken
    // und entsprechend reagieren (z.B. Mail als 'failed' markieren mit Grund).
    if (err instanceof CostCapExceededError) {
      logError("openai/cost-cap", "Cost-Cap überschritten — Pipeline abgebrochen", {
        cost_eur: bucket.cost_eur,
        max: MAX_COST_PER_MAIL_EUR,
        calls: bucket.calls,
        model_breakdown: bucket.model_breakdown,
      });
      return { result: undefined as T, cost: bucket, capHit: true };
    }
    throw err;
  }
}
