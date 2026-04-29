/**
 * Email-Webhook (Make.com Kompatibilität).
 *
 * Vorher (vor R5c): 2083-LOC Monolith.
 * Nachher (R5c): Thin Wrapper. Auth + Rate-Limit + Body-Parse, dann Aufruf
 * der Pipeline-Lib `runEmailPipeline()`. Die Pipeline ist auch via Direct-
 * Call aus `email-pipeline/ingest.ts` erreichbar (kein HTTP-Loopback).
 *
 * Body-Schema bleibt rückwärts-kompatibel zu Make.com:
 *   { email_betreff, email_absender, email_datum, anhaenge, secret, ... }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { safeCompare } from "@/lib/safe-compare";
import { logError, withRequestId } from "@/lib/logger";
import { runEmailPipeline, type EmailPipelineInput } from "@/lib/email-pipeline/run";

export const maxDuration = 60;

// F3.F11: Body-Größe-Limit + Zod-Schema. Vercel default 4MB-Limit deckt hier
// schon das gröbste ab; Zod validiert die strukturelle Korrektheit der von
// Make.com / pg_cron gesendeten Felder ohne strenge Constraints (lieber
// permissiv parsen als legitime Mails verwerfen).
const MAX_BODY_BYTES = 6 * 1024 * 1024; // 6 MB (4 PDF-Anhänge × ~1.3 MB)

const BodySchema = z.object({
  secret: z.string().min(1),
  email_betreff: z.string().max(500).optional().nullable(),
  email_absender: z.string().max(500).optional().nullable(),
  email_datum: z.string().max(100).optional().nullable(),
  email_text: z.string().optional().nullable(),
  email_body: z.string().optional().nullable(),
  anhaenge: z.array(z.unknown()).optional().nullable(),
  hasAttachments: z.boolean().optional(),
  vorfilter: z.string().optional().nullable(),
  haendler_id: z.string().uuid().optional().nullable(),
  haendler_name: z.string().max(500).optional().nullable(),
  su_id: z.string().uuid().optional().nullable(),
  bestellnummer_betreff: z.string().max(200).optional().nullable(),
  document_hint: z.string().max(100).optional().nullable(),
}).passthrough();

export async function POST(request: NextRequest) {
  try {
    const rlKey = getRateLimitKey(request, "webhook-email");
    const rl = checkRateLimit(rlKey, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Zu viele Anfragen." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
      );
    }

    // F3.F11 Body-Size-Check
    const contentLengthHeader = request.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
        return NextResponse.json({ error: "Body zu groß" }, { status: 413 });
      }
    }

    const rawBody = await request.json().catch(() => null);
    if (!rawBody || typeof rawBody !== "object") {
      return NextResponse.json({ error: "Body muss JSON sein" }, { status: 400 });
    }

    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) {
      logError("webhook/email", "Body-Validation fehlgeschlagen", parsed.error.issues);
      return NextResponse.json({ error: "Body invalid", issues: parsed.error.issues }, { status: 400 });
    }
    const body = parsed.data;

    if (!safeCompare(body.secret, process.env.MAKE_WEBHOOK_SECRET)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const input: EmailPipelineInput = {
      email_betreff: body.email_betreff || "",
      email_absender: body.email_absender || "",
      email_datum: body.email_datum || "",
      email_text: body.email_text ?? undefined,
      email_body: body.email_body ?? undefined,
      anhaenge: body.anhaenge ?? undefined,
      hasAttachments: body.hasAttachments,
      vorfilter: body.vorfilter ?? undefined,
      haendler_id: body.haendler_id,
      haendler_name: body.haendler_name,
      su_id: body.su_id,
      bestellnummer_betreff: body.bestellnummer_betreff,
      document_hint: body.document_hint,
    };

    // F3.F16: alle Logs der Pipeline-Run via Request-ID korrelierbar
    const result = await withRequestId(() => runEmailPipeline(input));
    return NextResponse.json(result);
  } catch (err) {
    logError("webhook/email", "Webhook Fehler", err);
    try {
      const supabase = createServiceClient();
      await supabase.from("webhook_logs").insert({
        typ: "email",
        status: "error",
        fehler_text: err instanceof Error ? err.message : String(err),
      });
    } catch { /* ignore */ }

    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
