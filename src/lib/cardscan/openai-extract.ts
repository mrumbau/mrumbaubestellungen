// CardScan Module – GPT-4o Structured Output Extraction
// Verwendet response_format: { type: "json_schema", strict: true }
// für zuverlässiges Schema-Enforcement (KEIN "bitte antworte als JSON").

import OpenAI from "openai";
import { logError, logInfo } from "@/lib/logger";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_JSON_SCHEMA } from "@/lib/cardscan/prompts";
import type { ExtractedContactData, ConfidenceScores } from "@/lib/cardscan/types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ROUTE_TAG = "/lib/cardscan/openai-extract";

interface ExtractionResult {
  data: ExtractedContactData;
  confidence: ConfidenceScores;
  durationMs: number;
}

/** Retry-Wrapper mit exponential backoff */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const isRetryable =
        err instanceof Error &&
        (err.message.includes("429") ||
          err.message.includes("timeout") ||
          err.message.includes("ECONNRESET") ||
          err.message.includes("500") ||
          err.message.includes("503"));

      if (!isRetryable || attempt === maxRetries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw new Error("Max retries reached");
}

/**
 * Extrahiert Kontaktdaten aus Text via GPT-4o Structured Outputs.
 * Verwendet json_schema response_format mit strict: true.
 */
export async function extractContactFromText(
  text: string
): Promise<ExtractionResult> {
  const start = Date.now();

  const response = await withRetry(() =>
    openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Extrahiere die Kontaktdaten aus folgendem Text:\n\n${text}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: EXTRACTION_JSON_SCHEMA,
      },
      temperature: 0.1,
    })
  );

  const durationMs = Date.now() - start;
  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error("GPT-4o returned empty response");
  }

  // Bei refusal (z.B. Policy-Verletzung)
  const refusal = response.choices[0]?.message?.refusal;
  if (refusal) {
    logError(ROUTE_TAG, "GPT-4o Refusal", { refusal });
    throw new Error(`GPT-4o hat die Anfrage abgelehnt: ${refusal}`);
  }

  const parsed = JSON.parse(content);

  // Confidence-Scores separieren
  const { confidence, ...contactFields } = parsed;

  logInfo(ROUTE_TAG, "Extraktion erfolgreich", {
    customerType: contactFields.customer_type,
    overallConfidence: confidence.overall,
    durationMs,
  });

  return {
    data: contactFields as ExtractedContactData,
    confidence: confidence as ConfidenceScores,
    durationMs,
  };
}

/**
 * Extrahiert Kontaktdaten aus einem Bild (Base64) via GPT-4o Vision.
 * Für OCR-Text + Bild-Kombination (Phase 3).
 */
export async function extractContactFromImage(
  ocrText: string,
  imageBase64?: string,
  mimeType?: string
): Promise<ExtractionResult> {
  const start = Date.now();

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

  // Text-Prompt VOR Bild platzieren (primt GPT-4o besser, Research-Erkenntnis)
  userContent.push({
    type: "text",
    text: `Extrahiere die Kontaktdaten aus folgendem OCR-Text einer Visitenkarte/eines Dokuments:\n\n${ocrText}`,
  });

  // Optional: Bild als Zusatzkontext (falls OCR unsicher)
  if (imageBase64 && mimeType) {
    userContent.push({
      type: "image_url",
      image_url: {
        url: `data:${mimeType};base64,${imageBase64}`,
        detail: "high",
      },
    });
  }

  const response = await withRetry(() =>
    openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: EXTRACTION_JSON_SCHEMA,
      },
      temperature: 0.1,
    })
  );

  const durationMs = Date.now() - start;
  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error("GPT-4o returned empty response");
  }

  const refusal = response.choices[0]?.message?.refusal;
  if (refusal) {
    logError(ROUTE_TAG, "GPT-4o Refusal (Image)", { refusal });
    throw new Error(`GPT-4o hat die Anfrage abgelehnt: ${refusal}`);
  }

  const parsed = JSON.parse(content);
  const { confidence, ...contactFields } = parsed;

  logInfo(ROUTE_TAG, "Bild-Extraktion erfolgreich", {
    customerType: contactFields.customer_type,
    overallConfidence: confidence.overall,
    durationMs,
  });

  return {
    data: contactFields as ExtractedContactData,
    confidence: confidence as ConfidenceScores,
    durationMs,
  };
}
