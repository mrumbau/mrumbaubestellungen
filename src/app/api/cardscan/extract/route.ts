// CardScan API – POST /api/cardscan/extract
// Unterstützt drei Modi:
// 1. JSON body mit { text, source_type } → Text-Extraktion
// 2. FormData mit Bild → Google Vision OCR → GPT-4o
// 3. FormData mit PDF/DOCX/vCard → Text-Extraktion / direktes Parsing

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
import { checkVisionDailyQuota } from "@/lib/cardscan/vision-quota";
import {
  parseBase64Image,
  validateImageSize,
  prepareImageForOcr,
} from "@/lib/cardscan/image-preprocess";
import { parseVcard } from "@/lib/cardscan/vcard-parser";
import {
  CARDSCAN_RATE_LIMIT,
  CARDSCAN_RATE_LIMITS_BY_TYPE,
  CARDSCAN_MAX_FILE_SIZE_BYTES,
  CARDSCAN_STORAGE_BUCKET,
} from "@/lib/cardscan/constants";
import type { CardScanSourceType } from "@/lib/cardscan/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/cardscan/extract";

// F7.13: Server-Image-Whitelist aus Constants importieren (Single Source of Truth)
const IMAGE_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp"]; // matches CARDSCAN_SERVER_IMAGE_TYPES
const PDF_TYPE = "application/pdf";
const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const VCARD_TYPES = ["text/vcard", "text/x-vcard"];

const ALL_ALLOWED_TYPES = [
  ...IMAGE_TYPES,
  PDF_TYPE,
  DOCX_TYPE,
  ...VCARD_TYPES,
];

export async function POST(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json(
        { error: ERRORS.UNGUELTIGER_URSPRUNG },
        { status: 403 }
      );
    }

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

    if (contentType.includes("multipart/form-data")) {
      return await handleFileExtract(request, user.id);
    }

    return await handleTextExtract(request, user.id);
  } catch (err) {
    logError(ROUTE, "Unerwarteter Fehler", err);
    const detail =
      err instanceof Error
        ? `${err.name}: ${err.message}`
        : String(err);
    return NextResponse.json(
      { error: `${ERRORS.INTERNER_FEHLER} – ${detail}` },
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

  const { data: extractedData, confidence, durationMs, inputTokens, outputTokens, costEur } =
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
      // F7.2: Cost-Tracking persistieren
      openai_input_tokens: inputTokens,
      openai_output_tokens: outputTokens,
      openai_cost_eur: costEur,
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

// ─── Datei-Extraktion (Bild / PDF / DOCX / vCard) ──────────────────

async function handleFileExtract(request: NextRequest, userId: string) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const sourceType = (formData.get("source_type") as string) || "file";

  if (!file) {
    return NextResponse.json(
      { error: "Keine Datei hochgeladen" },
      { status: 400 }
    );
  }

  if (file.size > CARDSCAN_MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "Datei zu groß (maximal 10 MB)" },
      { status: 400 }
    );
  }

  // MIME-Type bestimmen (file.type kann leer sein bei .vcf)
  let mimeType = file.type;
  if (!mimeType || mimeType === "application/octet-stream") {
    const name = file.name.toLowerCase();
    if (name.endsWith(".vcf")) mimeType = "text/vcard";
    else if (name.endsWith(".pdf")) mimeType = PDF_TYPE;
    else if (name.endsWith(".docx")) mimeType = DOCX_TYPE;
    else if (name.endsWith(".jpg") || name.endsWith(".jpeg")) mimeType = "image/jpeg";
    else if (name.endsWith(".png")) mimeType = "image/png";
    else if (name.endsWith(".webp")) mimeType = "image/webp";
  }

  if (!ALL_ALLOWED_TYPES.includes(mimeType)) {
    return NextResponse.json(
      {
        error: `Dateityp "${mimeType || "unbekannt"}" nicht unterstützt. Erlaubt: JPEG, PNG, WebP, PDF, DOCX, vCard (.vcf).`,
      },
      { status: 400 }
    );
  }

  // ─── vCard: Direktes Parsing ohne GPT ─────────────────────────────
  if (VCARD_TYPES.includes(mimeType)) {
    return handleVcardExtract(file, userId, sourceType);
  }

  // ─── PDF: Text extrahieren → GPT-4o ──────────────────────────────
  if (mimeType === PDF_TYPE) {
    return handlePdfExtract(file, userId, sourceType);
  }

  // ─── DOCX: Text extrahieren → GPT-4o ─────────────────────────────
  if (mimeType === DOCX_TYPE) {
    return handleDocxExtract(file, userId, sourceType);
  }

  // ─── Bilder: Google Vision OCR → GPT-4o ───────────────────────────
  if (IMAGE_TYPES.includes(mimeType)) {
    return handleImageExtract(file, userId, sourceType);
  }

  return NextResponse.json(
    { error: "Dateityp nicht verarbeitet" },
    { status: 400 }
  );
}

// ─── vCard Handler ──────────────────────────────────────────────────

async function handleVcardExtract(
  file: File,
  userId: string,
  sourceType: string
) {
  const text = await file.text();

  if (!text.includes("BEGIN:VCARD")) {
    return NextResponse.json(
      { error: "Ungültige vCard-Datei (kein BEGIN:VCARD gefunden)" },
      { status: 400 }
    );
  }

  const { data: extractedData, confidence } = parseVcard(text);

  const serviceClient = createServiceClient();
  const { data: capture, error: dbError } = await serviceClient
    .from("cardscan_captures")
    .insert({
      user_id: userId,
      source_type: sourceType as CardScanSourceType,
      raw_text: text,
      source_meta: { filename: file.name, mime_type: "text/vcard" },
      extracted_data: extractedData,
      confidence_scores: confidence,
      status: "review",
      llm_duration_ms: 0, // Kein GPT-Call
    })
    .select("id, status, extracted_data, confidence_scores")
    .single();

  if (dbError) {
    logError(ROUTE, "DB Insert fehlgeschlagen (vCard)", dbError);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }

  logInfo(ROUTE, "vCard-Extraktion erfolgreich", {
    captureId: capture.id,
    userId,
  });

  return NextResponse.json({
    success: true,
    capture_id: capture.id,
    extracted_data: extractedData,
    confidence_scores: confidence,
    duration_ms: 0,
  });
}

// ─── PDF Handler ────────────────────────────────────────────────────

async function handlePdfExtract(
  file: File,
  userId: string,
  sourceType: string
) {
  const { PDFParse } = await import("pdf-parse");
  const buffer = Buffer.from(await file.arrayBuffer());

  let pdfText: string;
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    pdfText = result.text;
  } catch (err) {
    logError(ROUTE, "PDF-Parsing fehlgeschlagen", err);
    return NextResponse.json(
      { error: "PDF konnte nicht gelesen werden." },
      { status: 422 }
    );
  }

  if (!pdfText || pdfText.trim().length < 5) {
    return NextResponse.json(
      {
        error:
          "Kein Text im PDF gefunden. Falls es ein gescanntes Dokument ist, bitte als Foto hochladen.",
      },
      { status: 422 }
    );
  }

  const trimmedText = pdfText.trim().slice(0, 10_000);

  const { data: extractedData, confidence, durationMs, inputTokens, outputTokens, costEur } =
    await extractContactFromText(trimmedText);

  const serviceClient = createServiceClient();
  const { data: capture, error: dbError } = await serviceClient
    .from("cardscan_captures")
    .insert({
      user_id: userId,
      source_type: sourceType as CardScanSourceType,
      raw_text: trimmedText,
      source_meta: { filename: file.name, mime_type: PDF_TYPE },
      extracted_data: extractedData,
      confidence_scores: confidence,
      status: "review",
      llm_duration_ms: durationMs,
      // F7.2
      openai_input_tokens: inputTokens,
      openai_output_tokens: outputTokens,
      openai_cost_eur: costEur,
    })
    .select("id, status, extracted_data, confidence_scores")
    .single();

  if (dbError) {
    logError(ROUTE, "DB Insert fehlgeschlagen (PDF)", dbError);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }

  logInfo(ROUTE, "PDF-Extraktion erfolgreich", {
    captureId: capture.id,
    userId,
    textLength: trimmedText.length,
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

// ─── DOCX Handler ───────────────────────────────────────────────────

async function handleDocxExtract(
  file: File,
  userId: string,
  sourceType: string
) {
  const mammoth = await import("mammoth");
  const buffer = Buffer.from(await file.arrayBuffer());

  let docxText: string;
  try {
    const result = await mammoth.extractRawText({ buffer });
    docxText = result.value;
  } catch (err) {
    logError(ROUTE, "DOCX-Parsing fehlgeschlagen", err);
    return NextResponse.json(
      { error: "DOCX konnte nicht gelesen werden." },
      { status: 422 }
    );
  }

  if (!docxText || docxText.trim().length < 5) {
    return NextResponse.json(
      { error: "Kein Text im DOCX gefunden." },
      { status: 422 }
    );
  }

  const trimmedText = docxText.trim().slice(0, 10_000);

  const { data: extractedData, confidence, durationMs, inputTokens, outputTokens, costEur } =
    await extractContactFromText(trimmedText);

  const serviceClient = createServiceClient();
  const { data: capture, error: dbError } = await serviceClient
    .from("cardscan_captures")
    .insert({
      user_id: userId,
      source_type: sourceType as CardScanSourceType,
      raw_text: trimmedText,
      source_meta: { filename: file.name, mime_type: DOCX_TYPE },
      extracted_data: extractedData,
      confidence_scores: confidence,
      status: "review",
      llm_duration_ms: durationMs,
      // F7.2
      openai_input_tokens: inputTokens,
      openai_output_tokens: outputTokens,
      openai_cost_eur: costEur,
    })
    .select("id, status, extracted_data, confidence_scores")
    .single();

  if (dbError) {
    logError(ROUTE, "DB Insert fehlgeschlagen (DOCX)", dbError);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }

  logInfo(ROUTE, "DOCX-Extraktion erfolgreich", {
    captureId: capture.id,
    userId,
    textLength: trimmedText.length,
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

// ─── Bild Handler (OCR + GPT-4o) ───────────────────────────────────

async function handleImageExtract(
  file: File,
  userId: string,
  sourceType: string
) {
  // F7.5: Strengeres Rate-Limit für teure Image-Pipeline (Vision + GPT-4o)
  const imageRateCheck = checkRateLimit(
    `cardscan:image:${userId}`,
    CARDSCAN_RATE_LIMITS_BY_TYPE.image.MAX_REQUESTS,
    CARDSCAN_RATE_LIMITS_BY_TYPE.image.WINDOW_MS,
  );
  if (!imageRateCheck.allowed) {
    return NextResponse.json(
      { error: `Zu viele Bild-Scans pro Minute (max ${CARDSCAN_RATE_LIMITS_BY_TYPE.image.MAX_REQUESTS}). Bitte kurz warten.` },
      { status: 429 },
    );
  }

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

  // R2/F7.2: Daily-Vision-Cap pro User vor dem teuren OCR-Call prüfen.
  const quota = await checkVisionDailyQuota(userId);
  if (!quota.allowed) {
    return NextResponse.json(
      {
        error: `Tageslimit für Visiten­karten-Scans erreicht (${quota.used}/${quota.cap}). Bitte morgen erneut versuchen oder Admin kontaktieren.`,
      },
      { status: 429 }
    );
  }

  // Google Vision OCR
  let ocrText: string;
  let ocrDurationMs: number;
  let visionCostEur = 0;
  try {
    const ocrResult = await ocrWithVision(processedBase64);
    ocrText = ocrResult.text;
    ocrDurationMs = ocrResult.durationMs;
    visionCostEur = ocrResult.costEur;
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
      {
        error:
          "Kein Text im Bild erkannt. Bitte ein deutlicheres Foto verwenden.",
      },
      { status: 422 }
    );
  }

  // GPT-4o mit OCR-Text + Bild als Kontext
  const {
    data: extractedData,
    confidence,
    durationMs: llmDurationMs,
    inputTokens: llmInputTokens,
    outputTokens: llmOutputTokens,
    costEur: llmCostEur,
  } = await extractContactFromImage(ocrText, processedBase64, processedMime);

  // Supabase Storage Upload
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
  }

  // DB Insert
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
      // F7.2: Cost-Tracking persistieren
      vision_cost_eur: visionCostEur,
      openai_input_tokens: llmInputTokens,
      openai_output_tokens: llmOutputTokens,
      openai_cost_eur: llmCostEur,
    })
    .select("id, status, extracted_data, confidence_scores")
    .single();

  if (dbError) {
    logError(ROUTE, "DB Insert fehlgeschlagen (Image)", dbError);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }

  logInfo(ROUTE, "Bild-Extraktion erfolgreich", {
    captureId: capture.id,
    userId,
    ocrTextLength: ocrText.length,
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
