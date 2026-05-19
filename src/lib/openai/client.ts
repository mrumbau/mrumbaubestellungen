/**
 * Zentraler OpenAI-Client + Retry/Cost-Tracking-Wrapper.
 *
 * Alle ChatCompletions im Repo MÜSSEN über `chatCompletion()` oder
 * `openai.chat.completions.parse(...)` mit `withRetry()`-Wrapper laufen —
 * sonst kein Cost-Tracking, kein Retry bei 5xx, kein einheitliches Timeout.
 *
 * 19.05.2026 (A2.7) — aus openai.ts extrahiert. Verhalten unverändert.
 */
import OpenAI from "openai";
import { logError, logInfo } from "@/lib/logger";
import { trackCost } from "./cost";

// F4.13 Fix: 60s Default-Timeout. PDF-Vision braucht oft 20-30s, knapp am SDK-
// Default 30s — bei großen PDFs hilft das. Maximal-Werte werden bei Bedarf
// pro Call überschrieben.
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60_000,
  maxRetries: 0, // wir machen Retries selbst via withRetry()
});

/**
 * Modelle die nur den Default-`temperature`-Wert (1) akzeptieren.
 * Reasoning-Familie: gpt-5*, o1, o3, o4. Custom temperature → 400 Fehler.
 * Wird beim Wechsel des Org/Project-Keys oft sichtbar, weil die
 * strict-Validierung dort serverseitig anders gehandhabt wird.
 */
export function modelDisallowsCustomTemperature(model: string): boolean {
  const m = model.toLowerCase();
  return m.startsWith("gpt-5") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4");
}

/** Retry-Wrapper mit exponential backoff für OpenAI-Calls. Auto-trackt Costs
 *  bei ChatCompletion-Responses (model + usage erkannt am Result-Shape).
 *
 *  F4.7 Fix: Retry-Detection via APIError.status statt String-Match auf der
 *  Error-Message. 4xx (außer 429) sind non-retryable — der Client-Fehler wird
 *  durch wiederholte Aufrufe nicht besser. */
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await fn();
      // R2/F4.1: Auto-Cost-Tracking. Auch wenn usage null/undefined ist:
      // trackCost rufen damit bucket.calls inkrementiert wird + Diagnose-Log.
      if (result && typeof result === "object" && "model" in result) {
        const r = result as {
          model?: string;
          usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
        };
        if (r.model) trackCost(r.model, r.usage ?? null);
      } else if (result && typeof result === "object") {
        // Result hat kein "model"-Feld — Cost-Tracking nicht möglich
        logInfo("openai/cost-debug", "withRetry-Result ohne model-Feld", {
          result_keys: Object.keys(result as object).slice(0, 10),
        });
      }
      return result;
    } catch (err: unknown) {
      let isRetryable = false;

      if (err instanceof OpenAI.APIError) {
        // Retryable: 429 (rate-limited), 5xx (server-side), explicit 408 (request timeout)
        const status = err.status ?? 0;
        isRetryable = status === 429 || status === 408 || (status >= 500 && status < 600);
      } else if (err instanceof Error) {
        // Network-Errors haben keinen .status — fallback auf String-Match
        const msg = err.message.toLowerCase();
        isRetryable =
          msg.includes("timeout")
          || msg.includes("econnreset")
          || msg.includes("etimedout")
          || msg.includes("network");
      }

      if (!isRetryable || attempt === maxRetries - 1) throw err;
      // Jitter zur Vermeidung von Thundering-Herd
      const backoff = 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw new Error("Max retries reached");
}

/**
 * Generischer Wrapper für `openai.chat.completions.create` (non-streaming),
 * der den zentralen Client + withRetry + Auto-Cost-Tracking erzwingt.
 *
 * Nutze IMMER diese Funktion statt `new OpenAI({...})` + direkter chat-Call.
 * Sonst: kein Cost-Tracking (AsyncLocalStorage-Bucket bleibt leer), kein
 * Retry bei OpenAI 5xx, kein einheitliches Timeout.
 *
 * Streaming wird bewusst NICHT unterstützt — alle Caller im Repo arbeiten
 * synchron auf Vercel-Serverless mit kompletter JSON-Response.
 */
export async function chatCompletion(
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  // Reasoning-Modelle (gpt-5*, o-Series) verlangen aktualisierte Param-Form:
  //   - temperature → muss Default (1) sein, sonst 400-Reject
  //   - max_tokens  → wurde zu `max_completion_tokens` umbenannt
  // 07.05.2026 — Auto-Migration im Wrapper damit Caller mit alter Param-Form
  // (max_tokens: 500) nicht crashen. Hat duplikat-check + bestellung-
  // zusammenfassung im Detail-View 500-en lassen.
  if (modelDisallowsCustomTemperature(params.model)) {
    const { temperature: _t, max_tokens, ...rest } = params;
    void _t;
    const fixed: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      ...rest,
      ...(max_tokens != null ? { max_completion_tokens: max_tokens } : {}),
    };
    return withRetry(() => openai.chat.completions.create(fixed));
  }
  return withRetry(() => openai.chat.completions.create(params));
}

/** Sicherer JSON-Parser für GPT-Responses — gibt Fallback statt Crash.
 *  F4.14 Fix: Parse-Fehler werden geloggt (vorher silent fallback → systematische
 *  Modell-Drift blieb unentdeckt). */
export function safeParseGptJson<T>(text: string, fallback: T, context = "openai/safeParseGptJson"): T {
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(jsonMatch ? jsonMatch[0] : clean);
  } catch (err) {
    logError(context, "JSON-Parse fehlgeschlagen — Fallback wird zurückgegeben", {
      error: err instanceof Error ? err.message : String(err),
      raw_preview: text.slice(0, 500),
    });
    return fallback;
  }
}
