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
import { createServiceClient } from "@/lib/supabase";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { safeCompare } from "@/lib/safe-compare";
import { logError } from "@/lib/logger";
import { runEmailPipeline, type EmailPipelineInput } from "@/lib/email-pipeline/run";

export const maxDuration = 60;

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

    const body = await request.json();

    if (!safeCompare(body.secret, process.env.MAKE_WEBHOOK_SECRET)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const input: EmailPipelineInput = {
      email_betreff: body.email_betreff || "",
      email_absender: body.email_absender || "",
      email_datum: body.email_datum || "",
      email_text: body.email_text,
      email_body: body.email_body,
      anhaenge: body.anhaenge,
      hasAttachments: body.hasAttachments,
      vorfilter: body.vorfilter,
      haendler_id: body.haendler_id,
      haendler_name: body.haendler_name,
      su_id: body.su_id,
      bestellnummer_betreff: body.bestellnummer_betreff,
      document_hint: body.document_hint,
    };

    const result = await runEmailPipeline(input);
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
