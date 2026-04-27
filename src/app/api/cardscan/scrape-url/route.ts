// CardScan API – POST /api/cardscan/scrape-url
// URL → Cheerio Scraping → GPT-4o Extraktion → DB
// SSRF-Schutz in url-scraper.ts

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { checkCsrf } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { ERRORS } from "@/lib/errors";
import { logError, logInfo } from "@/lib/logger";
import { scrapeUrl } from "@/lib/cardscan/url-scraper";
import { extractContactFromText } from "@/lib/cardscan/openai-extract";
import { CARDSCAN_RATE_LIMIT } from "@/lib/cardscan/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/cardscan/scrape-url";

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

    // Rate-Limit
    const rateLimitKey = `cardscan-url:${user.id}`;
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

    const body = await request.json();
    const { url } = body as { url?: string };

    if (!url || typeof url !== "string" || url.trim().length < 5) {
      return NextResponse.json(
        { error: "URL fehlt oder ist zu kurz" },
        { status: 400 }
      );
    }

    // 1. Scraping
    let scrapeResult;
    try {
      scrapeResult = await scrapeUrl(url.trim());
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Scraping fehlgeschlagen" },
        { status: 422 }
      );
    }

    // 2. GPT-4o Extraktion
    const { data: extractedData, confidence, durationMs: llmDurationMs } =
      await extractContactFromText(scrapeResult.text);

    // 3. In DB speichern
    const serviceClient = createServiceClient();
    const { data: capture, error: dbError } = await serviceClient
      .from("cardscan_captures")
      .insert({
        user_id: user.id,
        source_type: "url",
        raw_text: scrapeResult.text,
        source_meta: {
          url: url.trim(),
          scraped_urls: scrapeResult.scrapedUrls,
          scrape_duration_ms: scrapeResult.durationMs,
        },
        extracted_data: extractedData,
        confidence_scores: confidence,
        status: "review",
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

    logInfo(ROUTE, "URL-Extraktion erfolgreich", {
      captureId: capture.id,
      userId: user.id,
      url: url.trim(),
      pagesScraped: scrapeResult.scrapedUrls.length,
      overallConfidence: confidence.overall,
    });

    return NextResponse.json({
      success: true,
      capture_id: capture.id,
      extracted_data: extractedData,
      confidence_scores: confidence,
      scraped_urls: scrapeResult.scrapedUrls,
      duration_ms: scrapeResult.durationMs + llmDurationMs,
    });
  } catch (err) {
    logError(ROUTE, "Unerwarteter Fehler", err);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }
}
