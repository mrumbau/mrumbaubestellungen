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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/email-sync/log/[id]/replay — Mail erneut durch die Pipeline schicken.
 *
 * [id] darf die Graph-ID (so heisst die Zeile im Eingang) oder die
 * Internet-Message-ID sein. Optionaler Body `{ bestellung_id }`: dann wird
 * die Mail dieser Bestellung zugeordnet, auch wenn die KI sie fuer nicht
 * relevant hielt.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const profil = await getBenutzerProfil();
  if (!requireRoles(profil, "admin")) {
    return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
  }

  const { id } = await context.params;

  // F3.E10: Format-Check für RFC822 internet_message_id (`<...@...>`).
  // Verhindert dass arbiträre Strings den Replay-Pfad triggern oder logs spammen.
  if (
    typeof id !== "string"
    || id.length < 3
    || id.length > 998
    || !/^<.+@.+>$|^[A-Za-z0-9_.@+\-=]+$/.test(id)
  ) {
    return NextResponse.json(
      { error: "Invalid internet_message_id format" },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const erzwingeBestellungId =
    body && typeof body.bestellung_id === "string" && UUID.test(body.bestellung_id)
      ? body.bestellung_id
      : null;

  const supabase = createServiceClient();

  const internetMessageId = await loeseMessageIdAuf(supabase, id);
  if (!internetMessageId) {
    return NextResponse.json({ error: "Mail nicht im Protokoll" }, { status: 404 });
  }

  const result = await replayOneMessage(supabase, internetMessageId, {
    incrementRetryCount: false,
    erzwingeBestellungId,
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

async function loeseMessageIdAuf(
  supabase: ReturnType<typeof createServiceClient>,
  id: string,
): Promise<string | null> {
  if (/^<.+@.+>$/.test(id)) return id;
  const { data } = await supabase
    .from("email_processing_log")
    .select("internet_message_id")
    .eq("graph_message_id", id)
    .maybeSingle();
  if (data?.internet_message_id) return data.internet_message_id;
  const { data: direkt } = await supabase
    .from("email_processing_log")
    .select("internet_message_id")
    .eq("internet_message_id", id)
    .maybeSingle();
  return direkt?.internet_message_id ?? null;
}
