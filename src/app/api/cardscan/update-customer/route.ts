// CardScan API – POST /api/cardscan/update-customer
// Aktualisiert einen bestehenden Kunden im CRM (bei Duplikat-Merge).

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError, logInfo } from "@/lib/logger";
import { updateCustomerInCrm } from "@/lib/cardscan/das-programm-client";
import type { ExtractedContactData } from "@/lib/cardscan/types";

export const dynamic = "force-dynamic";

const ROUTE = "/api/cardscan/update-customer";

export async function POST(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const body = await request.json();
    const { crm, customer_id, final_data } = body as {
      crm: "crm1" | "crm2";
      customer_id: string;
      final_data: ExtractedContactData;
    };

    if (!crm || !customer_id || !final_data) {
      return NextResponse.json({ error: "crm, customer_id und final_data erforderlich" }, { status: 400 });
    }

    if (crm !== "crm1" && crm !== "crm2") {
      return NextResponse.json({ error: "crm muss 'crm1' oder 'crm2' sein" }, { status: 400 });
    }

    const token = crm === "crm1"
      ? process.env.DAS_PROGRAMM_TOKEN_CRM1 || ""
      : process.env.DAS_PROGRAMM_TOKEN_CRM2 || "";

    const result = await updateCustomerInCrm(token, customer_id, final_data, crm.toUpperCase());

    logInfo(ROUTE, "Kunden-Update", {
      crm,
      customerId: customer_id,
      status: result.status,
      userId: user.id,
    });

    return NextResponse.json({
      success: result.status === "success" || result.status === "dry_run",
      status: result.status,
      error: result.error,
    });
  } catch (err) {
    logError(ROUTE, "Unerwarteter Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
