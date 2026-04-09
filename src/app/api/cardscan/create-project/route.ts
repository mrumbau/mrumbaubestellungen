// CardScan API – POST /api/cardscan/create-project
// Erstellt ein Projekt im CRM, verknüpft mit dem gerade angelegten Kunden.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError, logInfo } from "@/lib/logger";
import { createProjectInCrm } from "@/lib/cardscan/das-programm-client";

export const dynamic = "force-dynamic";

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

    const body = await request.json();
    const { project_name, crm1_customer_id, crm2_customer_id } = body as {
      project_name: string;
      crm1_customer_id?: string;
      crm2_customer_id?: string;
    };

    if (!project_name || project_name.trim().length < 2) {
      return NextResponse.json({ error: "Projektname fehlt oder zu kurz" }, { status: 400 });
    }

    const token1 = process.env.DAS_PROGRAMM_TOKEN_CRM1 || "";
    const token2 = process.env.DAS_PROGRAMM_TOKEN_CRM2 || "";

    const results: Record<string, unknown> = {};

    // Parallel in beiden CRMs anlegen (wenn Customer-IDs vorhanden)
    const promises: Promise<void>[] = [];

    if (crm1_customer_id) {
      promises.push(
        createProjectInCrm(token1, crm1_customer_id, project_name.trim(), "CRM1")
          .then((r) => { results.crm1 = r; })
      );
    }

    if (crm2_customer_id) {
      promises.push(
        createProjectInCrm(token2, crm2_customer_id, project_name.trim(), "CRM2")
          .then((r) => { results.crm2 = r; })
      );
    }

    await Promise.allSettled(promises);

    logInfo(ROUTE, "Projekt erstellt", {
      projectName: project_name,
      userId: user.id,
      results,
    });

    return NextResponse.json({ success: true, results });
  } catch (err) {
    logError(ROUTE, "Unerwarteter Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
