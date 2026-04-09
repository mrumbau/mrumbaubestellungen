// CardScan API – GET /api/cardscan/captures
// Liste der eigenen Captures mit Pagination

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

const ROUTE = "/api/cardscan/captures";

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const offset = (page - 1) * limit;

    // RLS filtert automatisch auf user_id = auth.uid()
    const [dataResult, countResult] = await Promise.all([
      supabase
        .from("cardscan_captures")
        .select(
          "id, created_at, source_type, status, extracted_data, confidence_scores, crm1_status, crm2_status"
        )
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1),
      supabase
        .from("cardscan_captures")
        .select("id", { count: "exact", head: true }),
    ]);

    if (dataResult.error) {
      logError(ROUTE, "DB Query fehlgeschlagen", dataResult.error);
      return NextResponse.json(
        { error: ERRORS.INTERNER_FEHLER },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: dataResult.data,
      pagination: {
        page,
        limit,
        total: countResult.count ?? 0,
        totalPages: Math.ceil((countResult.count ?? 0) / limit),
      },
    });
  } catch (err) {
    logError(ROUTE, "Unerwarteter Fehler", err);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER },
      { status: 500 }
    );
  }
}
