/**
 * POST /api/admin/dsgvo-erasure
 *
 * Welle 2 — C5 (06.05.2026): DSGVO Right-to-Erasure-Workflow.
 *
 * Anonymisiert Personenbezug eines Bestellers (besteller_kuerzel) ohne
 * Buchhaltungs-Daten zu löschen — GoBD-konform: Belege bleiben, Personen-
 * bezug wird auf '[anonymisiert]' gesetzt + UGC (Kommentare) gelöscht.
 *
 * Schutz:
 *  - Nur admin-Rolle
 *  - CSRF-Check
 *  - Archivierte Bestellungen (archiviert_am IS NOT NULL) bleiben unverändert
 *    (GoBD-Lock greift via DB-Trigger gobd_block_archived_delete)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { getBenutzerProfil } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError, logInfo } from "@/lib/logger";

const BodySchema = z.object({
  besteller_kuerzel: z.string().min(1).max(10),
  bestaetigung: z.literal("DSGVO_ERASURE_CONFIRMED"),
});

export async function POST(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const profil = await getBenutzerProfil();
    if (!profil) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }
    if (profil.rolle !== "admin") {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const rawBody = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Body invalid", issues: parsed.error.issues }, { status: 400 });
    }
    const { besteller_kuerzel } = parsed.data;

    const supabase = createServiceClient();
    const { data: result, error } = await supabase
      .rpc("dsgvo_anonymize_besteller", { p_kuerzel: besteller_kuerzel });

    if (error) {
      logError("/api/admin/dsgvo-erasure", "RPC-Fehler", error);
      return NextResponse.json({ error: "Anonymisierung fehlgeschlagen", details: error.message }, { status: 500 });
    }

    logInfo("/api/admin/dsgvo-erasure", `DSGVO-Erasure ausgeführt für ${besteller_kuerzel}`, {
      executed_by: profil.kuerzel,
      result,
    });

    // Audit-Log
    await supabase.from("webhook_logs").insert({
      typ: "admin",
      status: "success",
      fehler_text: `DSGVO-Erasure ausgeführt für besteller_kuerzel=${besteller_kuerzel} durch ${profil.kuerzel}: ${JSON.stringify(result)}`,
    });

    return NextResponse.json({ success: true, result });
  } catch (err) {
    logError("/api/admin/dsgvo-erasure", "Unerwarteter Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
