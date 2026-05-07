// CardScan API – POST /api/cardscan/update-customer
// Aktualisiert einen bestehenden Kunden im CRM (bei Duplikat-Merge).
// Ownership: customer_id muss in duplicate_matches der referenzierten Capture stehen
// (verhindert dass User beliebige CRM-Kunden über die Webapp manipulieren kann).

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { checkCsrf } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { ERRORS } from "@/lib/errors";
import { logError, logInfo } from "@/lib/logger";
import { updateCustomerInCrm } from "@/lib/cardscan/das-programm-client";
import { CARDSCAN_RATE_LIMIT } from "@/lib/cardscan/constants";
import { isValidUUID } from "@/lib/validation";
import type { ExtractedContactData } from "@/lib/cardscan/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/cardscan/update-customer";

interface DuplicateMatchRow {
  crm?: string;
  customerId?: string;
}

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

    const rate = checkRateLimit(`cardscan-update:${user.id}`, CARDSCAN_RATE_LIMIT.MAX_REQUESTS, CARDSCAN_RATE_LIMIT.WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json({ error: ERRORS.ZU_VIELE_ANFRAGEN }, { status: 429 });
    }

    const body = await request.json();
    const { capture_id, crm, customer_id, final_data } = body as {
      capture_id?: string;
      crm?: "crm1" | "crm2";
      customer_id?: string;
      final_data?: ExtractedContactData;
    };

    if (!capture_id || !isValidUUID(capture_id)) {
      return NextResponse.json({ error: "capture_id fehlt oder ungültig" }, { status: 400 });
    }
    if (!crm || (crm !== "crm1" && crm !== "crm2")) {
      return NextResponse.json({ error: "crm muss 'crm1' oder 'crm2' sein" }, { status: 400 });
    }
    if (!customer_id || typeof customer_id !== "string") {
      return NextResponse.json({ error: "customer_id fehlt" }, { status: 400 });
    }
    if (!final_data || typeof final_data !== "object") {
      return NextResponse.json({ error: "final_data fehlt" }, { status: 400 });
    }

    // Ownership-Check: capture muss dem User gehören UND customer_id muss in
    // duplicate_matches stehen (= wurde durch unsere Duplikat-Suche identifiziert).
    const serviceClient = createServiceClient();
    const { data: capture } = await serviceClient
      .from("cardscan_captures")
      .select("id, duplicate_matches")
      .eq("id", capture_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!capture) {
      return NextResponse.json({ error: "Capture nicht gefunden" }, { status: 404 });
    }

    const matches: DuplicateMatchRow[] = Array.isArray(capture.duplicate_matches)
      ? (capture.duplicate_matches as DuplicateMatchRow[])
      : [];
    const allowed = matches.some((m) => m?.crm === crm && m?.customerId === customer_id);
    if (!allowed) {
      logError(ROUTE, "Versuchter Update auf nicht-duplikat customer_id", {
        userId: user.id,
        captureId: capture_id,
        crm,
        customerId: customer_id,
      });
      return NextResponse.json({ error: "customer_id gehört nicht zu Duplikat-Treffern dieses Captures" }, { status: 403 });
    }

    const token = crm === "crm1"
      ? process.env.DAS_PROGRAMM_TOKEN_CRM1 || ""
      : process.env.DAS_PROGRAMM_TOKEN_CRM2 || "";

    const result = await updateCustomerInCrm(token, customer_id, final_data, crm.toUpperCase());

    logInfo(ROUTE, "Kunden-Update", {
      crm,
      captureId: capture_id,
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
