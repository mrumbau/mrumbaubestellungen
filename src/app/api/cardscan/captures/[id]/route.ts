// CardScan API – GET/PATCH /api/cardscan/captures/[id]
// Einzelnen Capture abrufen oder final_data aktualisieren

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkCsrf } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { ERRORS } from "@/lib/errors";
import { logError, logInfo } from "@/lib/logger";
import { isValidUUID } from "@/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE = "/api/cardscan/captures/[id]";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!isValidUUID(id)) {
      return NextResponse.json(
        { error: ERRORS.UNGUELTIGE_ID },
        { status: 400 }
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

    // RLS filtert automatisch
    const { data: capture, error } = await supabase
      .from("cardscan_captures")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !capture) {
      return NextResponse.json(
        { error: ERRORS.NICHT_GEFUNDEN },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: capture });
  } catch (err) {
    logError(ROUTE, "Unerwarteter Fehler (GET)", err);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!checkCsrf(request)) {
      return NextResponse.json(
        { error: ERRORS.UNGUELTIGER_URSPRUNG },
        { status: 403 }
      );
    }

    if (!isValidUUID(id)) {
      return NextResponse.json(
        { error: ERRORS.UNGUELTIGE_ID },
        { status: 400 }
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

    // Rate-Limit: 30 Updates pro Minute
    const rateLimitKey = `cardscan-patch:${user.id}`;
    const rateCheck = checkRateLimit(rateLimitKey, 30, 60_000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: ERRORS.ZU_VIELE_ANFRAGEN },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { final_data, status } = body;

    // Erlaubte Status-Übergänge vom Client
    const allowedStatuses = ["review", "writing", "discarded"];
    const updateFields: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (final_data !== undefined) {
      updateFields.final_data = final_data;
    }

    if (status && allowedStatuses.includes(status)) {
      updateFields.status = status;
    }

    // RLS filtert automatisch auf eigene Captures
    const { data: updated, error } = await supabase
      .from("cardscan_captures")
      .update(updateFields)
      .eq("id", id)
      .select("id, status, final_data, updated_at")
      .single();

    if (error || !updated) {
      logError(ROUTE, "Update fehlgeschlagen", error);
      return NextResponse.json(
        { error: ERRORS.NICHT_GEFUNDEN },
        { status: 404 }
      );
    }

    logInfo(ROUTE, "Capture aktualisiert", {
      captureId: id,
      userId: user.id,
      newStatus: updated.status,
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    logError(ROUTE, "Unerwarteter Fehler (PATCH)", err);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }
}
