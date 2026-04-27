// CardScan API – POST /api/cardscan/search-duplicates
// Sucht parallel in beiden CRMs nach Duplikaten basierend auf extrahierten Daten.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { findDuplicates } from "@/lib/cardscan/duplicate-matcher";
import type { ExtractedContactData } from "@/lib/cardscan/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/cardscan/search-duplicates";

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

    const body = await request.json();
    const { extracted_data } = body as { extracted_data?: ExtractedContactData };

    if (!extracted_data || !extracted_data.customer_type) {
      return NextResponse.json(
        { error: "extracted_data fehlt oder ist ungültig" },
        { status: 400 }
      );
    }

    const { matches, durationMs } = await findDuplicates(extracted_data);

    return NextResponse.json({
      matches,
      total: matches.length,
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
