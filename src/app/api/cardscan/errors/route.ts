// CardScan API – GET /api/cardscan/errors
// Offene (unacknowledged) Sync-Fehler für das Error-Dashboard.
// PATCH zum Acknowledgen einzelner Fehler.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

const ROUTE = "/api/cardscan/errors";

export async function GET() {
  try {
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

    // RLS filtert auf eigene Fehler
    const { data, error } = await supabase
      .from("cardscan_sync_errors")
      .select(
        "id, created_at, capture_id, crm, error_type, error_message, acknowledged"
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      logError(ROUTE, "DB Query fehlgeschlagen", error);
      return NextResponse.json(
        { error: ERRORS.INTERNER_FEHLER },
        { status: 500 }
      );
    }

    const unacknowledgedCount = (data || []).filter(
      (e) => !e.acknowledged
    ).length;

    return NextResponse.json({
      data: data || [],
      unacknowledged_count: unacknowledgedCount,
    });
  } catch (err) {
    logError(ROUTE, "Unerwarteter Fehler", err);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
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

    const body = await request.json();
    const { error_id, acknowledge_all } = body as {
      error_id?: string;
      acknowledge_all?: boolean;
    };

    if (acknowledge_all) {
      // Alle eigenen Fehler als acknowledged markieren
      const { error } = await supabase
        .from("cardscan_sync_errors")
        .update({
          acknowledged: true,
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: user.id,
        })
        .eq("acknowledged", false);

      if (error) {
        logError(ROUTE, "Bulk-Acknowledge fehlgeschlagen", error);
        return NextResponse.json(
          { error: ERRORS.INTERNER_FEHLER },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    }

    if (!error_id) {
      return NextResponse.json(
        { error: "error_id oder acknowledge_all erforderlich" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("cardscan_sync_errors")
      .update({
        acknowledged: true,
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: user.id,
      })
      .eq("id", error_id);

    if (error) {
      logError(ROUTE, "Acknowledge fehlgeschlagen", error);
      return NextResponse.json(
        { error: ERRORS.INTERNER_FEHLER },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError(ROUTE, "Unerwarteter Fehler", err);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }
}
