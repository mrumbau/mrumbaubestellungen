// CardScan API – POST /api/cardscan/create-customer
// Dual-Write in beide CRMs + Error-Logging in cardscan_sync_errors.
// Aktualisiert den cardscan_captures Eintrag mit CRM-Ergebnissen.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { checkCsrf } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { ERRORS } from "@/lib/errors";
import { logError, logInfo } from "@/lib/logger";
import { createInBothCRMs } from "@/lib/cardscan/das-programm-client";
import { CARDSCAN_RATE_LIMIT } from "@/lib/cardscan/constants";
import type { ExtractedContactData } from "@/lib/cardscan/types";
import { isValidUUID } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/cardscan/create-customer";

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

    // Rate-Limit (CRM-Writes sind teurer als Extraktion)
    const rateLimitKey = `cardscan-create:${user.id}`;
    const rateCheck = checkRateLimit(
      rateLimitKey,
      CARDSCAN_RATE_LIMIT.MAX_REQUESTS,
      CARDSCAN_RATE_LIMIT.WINDOW_MS
    );
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: ERRORS.ZU_VIELE_ANFRAGEN },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { capture_id, final_data, duplicate_override } = body as {
      capture_id?: string;
      final_data?: ExtractedContactData;
      duplicate_override?: boolean;
    };

    if (!capture_id || !isValidUUID(capture_id)) {
      return NextResponse.json(
        { error: "capture_id fehlt oder ungültig" },
        { status: 400 }
      );
    }

    if (!final_data || !final_data.customer_type) {
      return NextResponse.json(
        { error: "final_data fehlt oder ist ungültig" },
        { status: 400 }
      );
    }

    // F7.3: Bestehende CRM-Customer-IDs laden — bei Retry nach partial_success
    // werden CRMs mit existierender ID übersprungen (kein Duplikat).
    const serviceClient = createServiceClient();
    const { data: existing } = await serviceClient
      .from("cardscan_captures")
      .select("crm1_customer_id, crm2_customer_id, status")
      .eq("id", capture_id)
      .eq("user_id", user.id)
      .maybeSingle();

    // Capture auf 'writing' setzen – nur wenn Status noch 'review' ist (verhindert doppelte Verarbeitung)
    const { data: updatedCapture, error: updateError } = await serviceClient
      .from("cardscan_captures")
      .update({
        status: "writing",
        final_data,
        duplicate_override: duplicate_override ?? false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", capture_id)
      .eq("user_id", user.id)
      .in("status", ["review", "failed"])
      .select("id")
      .maybeSingle();

    if (!updatedCapture) {
      return NextResponse.json(
        { error: "Dieser Kontakt wird bereits verarbeitet oder wurde schon angelegt." },
        { status: 409 }
      );
    }

    if (updateError) {
      logError(ROUTE, "Capture-Update fehlgeschlagen", updateError);
      return NextResponse.json(
        { error: ERRORS.INTERNER_FEHLER },
        { status: 500 }
      );
    }

    // Dual-Write in beide CRMs (F7.3: mit Idempotenz-Skip bei vorhandenen IDs)
    const result = await createInBothCRMs(final_data, {
      existingCrm1CustomerId: existing?.crm1_customer_id ?? null,
      existingCrm2CustomerId: existing?.crm2_customer_id ?? null,
      captureId: capture_id,
    });

    // CRM-Status in cardscan_captures speichern
    const crmStatus = (s: string) => {
      if (s === "dry_run") return "skipped";
      if (s === "partial_success") return "success";
      return s as "success" | "failed" | "skipped";
    };

    const captureUpdate: Record<string, unknown> = {
      crm1_customer_id: result.crm1.customerId,
      crm1_reference_number: result.crm1.referenceNumber,
      crm1_status: crmStatus(result.crm1.status),
      crm1_error: result.crm1.error,
      crm1_duration_ms: result.crm1.durationMs,
      crm2_customer_id: result.crm2.customerId,
      crm2_reference_number: result.crm2.referenceNumber,
      crm2_status: crmStatus(result.crm2.status),
      crm2_error: result.crm2.error,
      crm2_duration_ms: result.crm2.durationMs,
      updated_at: new Date().toISOString(),
    };

    // Gesamt-Status
    if (result.overallStatus === "dry_run") {
      captureUpdate.status = "success"; // Dry-Run gilt als Erfolg
    } else if (result.overallStatus === "success") {
      captureUpdate.status = "success";
    } else if (result.overallStatus === "partial_success") {
      captureUpdate.status = "partial_success";
    } else {
      captureUpdate.status = "failed";
    }

    const { error: captureUpdateError } = await serviceClient
      .from("cardscan_captures")
      .update(captureUpdate)
      .eq("id", capture_id)
      .eq("user_id", user.id);

    if (captureUpdateError) {
      logError(ROUTE, "CRM-Status-Update fehlgeschlagen", captureUpdateError);
      return NextResponse.json(
        { error: ERRORS.INTERNER_FEHLER },
        { status: 500 }
      );
    }

    // Fehler in cardscan_sync_errors loggen
    const errorInserts: Record<string, unknown>[] = [];

    if (result.crm1.error) {
      errorInserts.push({
        user_id: user.id,
        capture_id,
        crm: "crm1",
        error_type: "unknown",
        error_message: result.crm1.error,
        error_details: { warnings: result.crm1.warnings },
      });
    }
    // Warnings von CRM1 (z.B. Adresse fehlgeschlagen, Kunde aber erstellt)
    for (const warning of result.crm1.warnings) {
      errorInserts.push({
        user_id: user.id,
        capture_id,
        crm: "crm1",
        error_type: "validation",
        error_message: warning,
        error_details: { customerId: result.crm1.customerId },
      });
    }

    if (result.crm2.error) {
      errorInserts.push({
        user_id: user.id,
        capture_id,
        crm: "crm2",
        error_type: "unknown",
        error_message: result.crm2.error,
        error_details: { warnings: result.crm2.warnings },
      });
    }
    for (const warning of result.crm2.warnings) {
      errorInserts.push({
        user_id: user.id,
        capture_id,
        crm: "crm2",
        error_type: "validation",
        error_message: warning,
        error_details: { customerId: result.crm2.customerId },
      });
    }

    if (errorInserts.length > 0) {
      const { error: syncErr } = await serviceClient
        .from("cardscan_sync_errors")
        .insert(errorInserts);
      if (syncErr) {
        logError(ROUTE, "Sync-Error-Insert fehlgeschlagen", syncErr);
      }
    }

    logInfo(ROUTE, "Customer-Create abgeschlossen", {
      captureId: capture_id,
      userId: user.id,
      overallStatus: result.overallStatus,
      crm1: result.crm1.status,
      crm2: result.crm2.status,
    });

    return NextResponse.json({
      success: true,
      overall_status: result.overallStatus,
      crm1: {
        status: result.crm1.status,
        customer_id: result.crm1.customerId,
        reference_number: result.crm1.referenceNumber,
        warnings: result.crm1.warnings,
      },
      crm2: {
        status: result.crm2.status,
        customer_id: result.crm2.customerId,
        reference_number: result.crm2.referenceNumber,
        warnings: result.crm2.warnings,
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
