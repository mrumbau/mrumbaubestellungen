// CardScan API – POST /api/cardscan/create-project
// Erstellt ein Projekt im CRM, verknüpft mit dem gerade angelegten Kunden.
// Ownership: customer_ids werden aus capture geladen, NICHT aus Body, damit User
// keine Projekte für fremde CRM-Kunden anlegen können.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { checkCsrf } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { ERRORS } from "@/lib/errors";
import { logError, logInfo } from "@/lib/logger";
import { createProjectInCrm } from "@/lib/cardscan/das-programm-client";
import { isValidUUID } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/cardscan/create-project";

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

    // 5/min — Projekt-Erstellung ist teurer als Kunden-Update
    const rate = checkRateLimit(`cardscan-project:${user.id}`, 5, 60_000);
    if (!rate.allowed) {
      return NextResponse.json({ error: ERRORS.ZU_VIELE_ANFRAGEN }, { status: 429 });
    }

    const body = await request.json();
    const { capture_id, project_name } = body as {
      capture_id?: string;
      project_name?: string;
    };

    if (!capture_id || !isValidUUID(capture_id)) {
      return NextResponse.json({ error: "capture_id fehlt oder ungültig" }, { status: 400 });
    }
    if (!project_name || project_name.trim().length < 2) {
      return NextResponse.json({ error: "Projektname fehlt oder zu kurz" }, { status: 400 });
    }

    // customer_ids aus DB laden (nicht aus Body — Ownership-Check)
    const serviceClient = createServiceClient();
    const { data: capture } = await serviceClient
      .from("cardscan_captures")
      .select("crm1_customer_id, crm2_customer_id, status")
      .eq("id", capture_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!capture) {
      return NextResponse.json({ error: "Capture nicht gefunden" }, { status: 404 });
    }

    if (!capture.crm1_customer_id && !capture.crm2_customer_id) {
      return NextResponse.json(
        { error: "Capture hat noch keine CRM-Kunden — bitte erst Kunden anlegen." },
        { status: 400 }
      );
    }

    const token1 = process.env.DAS_PROGRAMM_TOKEN_CRM1 || "";
    const token2 = process.env.DAS_PROGRAMM_TOKEN_CRM2 || "";

    const results: Record<string, unknown> = {};
    const promises: Promise<void>[] = [];

    if (capture.crm1_customer_id) {
      promises.push(
        createProjectInCrm(token1, capture.crm1_customer_id, project_name.trim(), "CRM1")
          .then((r) => { results.crm1 = r; })
      );
    }
    if (capture.crm2_customer_id) {
      promises.push(
        createProjectInCrm(token2, capture.crm2_customer_id, project_name.trim(), "CRM2")
          .then((r) => { results.crm2 = r; })
      );
    }

    await Promise.allSettled(promises);

    logInfo(ROUTE, "Projekt erstellt", {
      projectName: project_name,
      captureId: capture_id,
      userId: user.id,
      results,
    });

    return NextResponse.json({ success: true, results });
  } catch (err) {
    logError(ROUTE, "Unerwarteter Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
