// CardScan API – POST /api/cardscan/extract
// Unterstützt zwei Modi:
// 1. JSON body mit { text, source_type } → Text-Extraktion
// 2. FormData mit file + source_type → Bild-OCR → Text-Extraktion

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { checkCsrf } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { ERRORS } from "@/lib/errors";
import { logError, logInfo } from "@/lib/logger";
import {
  extractContactFromText,
  extractContactFromImage,
} from "@/lib/cardscan/openai-extract";
import { ocrWithVision } from "@/lib/cardscan/google-vision";
import {
  parseBase64Image,
  validateImageSize,
  prepareImageForOcr,
} from "@/lib/cardscan/image-preprocess";
import {
  CARDSCAN_RATE_LIMIT,
  CARDSCAN_MAX_FILE_SIZE_BYTES,
  CARDSCAN_STORAGE_BUCKET,
} from "@/lib/cardscan/constants";
import type { CardScanSourceType } from "@/lib/cardscan/types";

export const dynamic = "force-dynamic";

const ROUTE = "/api/cardscan/extract";

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export async function POST(request: NextRequest) {
  try {
    // CSRF-Check
    if (!checkCsrf(request)) {
      return NextResponse.json(
        { error: ERRORS.UNGUELTIGER_URSPRUNG },
        { status: 403 }
      );
    }

    // Auth
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: ERRORS.NICHT_AUTHENTIFIZIERT },
        { status: 401 }
      );
    }

    // Rate-Limit
    const rateLimitKey = `cardscan:${user.id}`;
    const rateCheck = checkRateLimit(
      rateLimitKey,
      CARDSCAN_RATE_LIMIT.MAX_REQUESTS,
      CARDSCAN_RATE_LIMIT.WINDOW_MS
    );
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: ERRORS.ZU_VIELE_ANFRAGEN },
        { status: 429 }
      );
    }

    const contentType = request.headers.get("content-type") || "";

    // ─── Modus 2: FormData (Bild-Upload) ────────────────────────────
    if (contentType.includes("multipart/form-data")) {
      return handleImageExtract(request, user.id);
    }

    // ─── Modus 1: JSON (Text-Extraktion) ────────────────────────────
    return handleTextExtract(request, user.id);
  } catch (err) {
    logError(ROUTE, "Unerwarteter Fehler", err);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }
}

// ─── Text-Extraktion ────────────────────────────────────────────────

async function handleTextExtract(request: NextRequest, userId: string) {
  const body = await request.json();
  const { text, source_type } = body as {
    text?: string;
    source_type?: CardScanSourceType;
  };

  if (!text || typeof text !== "string" || text.trim().length < 5) {
    return NextResponse.json(
      { error: "Text ist zu kurz oder fehlt (mindestens 5 Zeichen)" },
      { status: 400 }
    );
  }

  if (text.length > 10_000) {
    return NextResponse.json(
      { error: "Text ist zu lang (maximal 10.000 Zeichen)" },
      { status: 400 }
    );
  }

  const effectiveSourceType: CardScanSourceType = source_type || "text";

  const { data: extractedData, confidence, durationMs } =
    await extractContactFromText(text.trim());

  const serviceClient = createServiceClient();
  const { data: capture, error: dbError } = await serviceClient
    .from("cardscan_captures")
    .insert({
      user_id: userId,
      source_type: effectiveSourceType,
      raw_text: text.trim(),
      extracted_data: extractedData,
      confidence_scores: confidence,
      status: "review",
      llm_duration_ms: durationMs,
    })
    .select("id, status, extracted_data, confidence_scores")
    .single();

  if (dbError) {
    logError(ROUTE, "DB Insert fehlgeschlagen", dbError);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }

  logInfo(ROUTE, "Text-Extraktion erfolgreich", {
    captureId: capture.id,
    userId,
    sourceType: effectiveSourceType,
    overallConfidence: confidence.overall,
    durationMs,
  });

  return NextResponse.json({
    success: true,
    capture_id: capture.id,
    extracted_data: extractedData,
    confidence_scores: confidence,
    duration_ms: durationMs,
  });
}

// ─── Bild-Extraktion (OCR + GPT-4o) ────────────────────────────────

async function handleImageExtract(request: NextRequest, userId: string) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const sourceType = (formData.get("source_type") as string) || "image";

  if (!file) {
    return NextResponse.json(
      { error: "Keine Datei hochgeladen" },
      { status: 400 }
    );
  }

  // MIME-Type validieren
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Dateityp ${file.type} nicht unterstützt. Erlaubt: JPEG, PNG, WebP.` },
      { status: 400 }
    );
  }

  // Dateigröße prüfen
  if (file.size > CARDSCAN_MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "Datei zu groß (maximal 10 MB)" },
      { status: 400 }
    );
  }

  // File → Base64
  const arrayBuffer = await file.arrayBuffer();
  const base64Raw = Buffer.from(arrayBuffer).toString("base64");

  const { base64, mimeType } = parseBase64Image(base64Raw);
  const sizeCheck = validateImageSize(base64, CARDSCAN_MAX_FILE_SIZE_BYTES);
  if (!sizeCheck.valid) {
    return NextResponse.json(
      { error: "Bild zu groß nach Verarbeitung" },
      { status: 400 }
    );
  }

  const { base64: processedBase64, mimeType: processedMime } =
    prepareImageForOcr(base64, mimeType);

  // 1. Google Vision OCR
  let ocrText: string;
  let ocrDurationMs: number;
  try {
    const ocrResult = await ocrWithVision(processedBase64);
    ocrText = ocrResult.text;
    ocrDurationMs = ocrResult.durationMs;
  } catch (err) {
    logError(ROUTE, "OCR fehlgeschlagen", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "OCR fehlgeschlagen. Bitte GOOGLE_CLOUD_VISION_API_KEY prüfen.",
      },
      { status: 500 }
    );
  }

  if (!ocrText || ocrText.trim().length < 3) {
    return NextResponse.json(
      { error: "Kein Text im Bild erkannt. Bitte ein deutlicheres Foto verwenden." },
      { status: 422 }
    );
  }

  // 2. GPT-4o Extraktion (OCR-Text + optional Bild als Kontext)
  const { data: extractedData, confidence, durationMs: llmDurationMs } =
    await extractContactFromImage(ocrText, processedBase64, processedMime);

  // 3. Bild in Supabase Storage speichern
  const serviceClient = createServiceClient();
  const timestamp = Date.now();
  const ext = processedMime === "image/png" ? "png" : "jpg";
  const storagePath = `${userId}/${timestamp}_capture.${ext}`;

  const imageBuffer = Buffer.from(processedBase64, "base64");
  const { error: storageError } = await serviceClient.storage
    .from(CARDSCAN_STORAGE_BUCKET)
    .upload(storagePath, imageBuffer, {
      contentType: processedMime,
      upsert: false,
    });

  if (storageError) {
    logError(ROUTE, "Storage Upload fehlgeschlagen", storageError);
    // Nicht fatal – wir speichern trotzdem die extrahierten Daten
  }

  // 4. In DB speichern
  const { data: capture, error: dbError } = await serviceClient
    .from("cardscan_captures")
    .insert({
      user_id: userId,
      source_type: sourceType as CardScanSourceType,
      raw_image_path: storageError ? null : storagePath,
      raw_text: ocrText,
      extracted_data: extractedData,
      confidence_scores: confidence,
      status: "review",
      ocr_duration_ms: ocrDurationMs,
      llm_duration_ms: llmDurationMs,
    })
    .select("id, status, extracted_data, confidence_scores")
    .single();

  if (dbError) {
    logError(ROUTE, "DB Insert fehlgeschlagen", dbError);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }

  logInfo(ROUTE, "Bild-Extraktion erfolgreich", {
    captureId: capture.id,
    userId,
    ocrTextLength: ocrText.length,
    overallConfidence: confidence.overall,
    ocrDurationMs,
    llmDurationMs,
  });

  return NextResponse.json({
    success: true,
    capture_id: capture.id,
    extracted_data: extractedData,
    confidence_scores: confidence,
    ocr_text: ocrText,
    duration_ms: ocrDurationMs + llmDurationMs,
  });
}
