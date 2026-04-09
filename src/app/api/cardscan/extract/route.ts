// CardScan API – POST /api/cardscan/extract
// Text → GPT-4o Structured Output → strukturierte Kontaktdaten
// Erstellt einen cardscan_captures Eintrag in der DB

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { checkCsrf } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { ERRORS } from "@/lib/errors";
import { logError, logInfo } from "@/lib/logger";
import { extractContactFromText } from "@/lib/cardscan/openai-extract";
import { CARDSCAN_RATE_LIMIT } from "@/lib/cardscan/constants";
import type { CardScanSourceType } from "@/lib/cardscan/types";

export const dynamic = "force-dynamic";

const ROUTE = "/api/cardscan/extract";

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

    // Body parsen
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

    // GPT-4o Extraktion
    const { data: extractedData, confidence, durationMs } =
      await extractContactFromText(text.trim());

    // In DB speichern (Service Client umgeht RLS für Insert)
    const serviceClient = createServiceClient();
    const { data: capture, error: dbError } = await serviceClient
      .from("cardscan_captures")
      .insert({
        user_id: user.id,
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

    logInfo(ROUTE, "Extraktion erfolgreich", {
      captureId: capture.id,
      userId: user.id,
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
  } catch (err) {
    logError(ROUTE, "Unerwarteter Fehler", err);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }
}
