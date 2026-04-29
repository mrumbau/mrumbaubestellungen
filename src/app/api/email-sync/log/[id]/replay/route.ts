/**
 * POST /api/email-sync/log/:id/replay
 *
 * Manueller Replay einer bereits verarbeiteten Mail.
 * Use Cases: nach Bug-Fix, Test der Pipeline mit echten Daten.
 *
 * Mechanik delegiert an lib/email-sync/replay.ts (geteilt mit Auto-Retry-Cron).
 * Manueller Replay erhöht den retry_count NICHT — sonst würde Auto-Retry
 * danach schneller geben, was unerwünscht ist.
 *
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getBenutzerProfil, requireRoles } from "@/lib/auth";
import { replayOneMessage } from "@/lib/email-sync/replay";
import { ERRORS } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const profil = await getBenutzerProfil();
  if (!requireRoles(profil, "admin")) {
    return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
  }

  const { id: internetMessageId } = await context.params;

  // F3.E10: Format-Check für RFC822 internet_message_id (`<...@...>`).
  // Verhindert dass arbiträre Strings den Replay-Pfad triggern oder logs spammen.
  if (
    typeof internetMessageId !== "string"
    || internetMessageId.length < 3
    || internetMessageId.length > 998
    || !/^<.+@.+>$|^[A-Za-z0-9_.@+\-=]+$/.test(internetMessageId)
  ) {
    return NextResponse.json(
      { error: "Invalid internet_message_id format" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  const result = await replayOneMessage(supabase, internetMessageId, {
    incrementRetryCount: false,
  });

  if (result.outcome === "gone") {
    return NextResponse.json(
      { success: false, outcome: "gone", error: result.fehler },
      { status: 410 },
    );
  }
  if (result.outcome === "failed") {
    return NextResponse.json(
      { success: false, outcome: "failed", fehler: result.fehler },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    outcome: result.outcome,
    bestellung_id: result.bestellung_id,
  });
}
