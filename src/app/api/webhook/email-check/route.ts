/**
 * Make.com-Pre-Check für Email-Verarbeitung.
 *
 * R5a/F3.C3: Logik wurde nach `src/lib/email-pipeline/classify-logic.ts`
 * extrahiert. Diese Route ist jetzt thin — Auth + Rate-Limit + Lib-Call.
 * `classify.ts` ruft die Lib-Funktion direkt (kein HTTP-Loopback mehr).
 */

import { NextRequest, NextResponse } from "next/server";
import { safeCompare } from "@/lib/safe-compare";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { classifyEmailLogic } from "@/lib/email-pipeline/classify-logic";

export async function POST(request: NextRequest) {
  try {
    // Rate-Limit (30/min — leichtgewichtig, Pre-Check)
    const rlKey = getRateLimitKey(request, "email-check");
    const rl = checkRateLimit(rlKey, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Zu viele Anfragen" }, { status: 429 });
    }

    const body = await request.json();
    const { secret, email_absender, email_betreff, email_vorschau, hat_anhaenge } = body;

    if (!safeCompare(secret, process.env.MAKE_WEBHOOK_SECRET)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await classifyEmailLogic({
      email_absender: email_absender || "",
      email_betreff: email_betreff || "",
      email_vorschau: email_vorschau || "",
      hat_anhaenge: !!hat_anhaenge,
    });

    return NextResponse.json(result);
  } catch (err) {
    // R2/F3.E7: Service-Error → 503 + retry-Hint, NICHT fail-open.
    logError("/api/webhook/email-check", "Outer catch — Service-Fehler, fail-closed", err);
    return NextResponse.json(
      { relevant: false, grund: "service_unavailable", retry: true },
      { status: 503 },
    );
  }
}
