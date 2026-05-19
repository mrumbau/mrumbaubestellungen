/**
 * POST /api/admin/dsgvo-export
 *
 * A4.13 (19.05.2026): DSGVO Art. 15 — Auskunftsrecht.
 *
 * Liefert alle personenbezogenen Daten eines Bestellers als JSON-Download.
 * Gegenstück zu /api/admin/dsgvo-erasure (Art. 17).
 *
 * Schutz:
 *  - Nur admin-Rolle
 *  - CSRF-Check
 *  - Audit-Log (wer hat wann welchen User exportiert)
 *
 * Response:
 *  Content-Type: application/json; Content-Disposition: attachment;
 *  filename="dsgvo-export-<kuerzel>-<YYYY-MM-DD>.json"
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createTypedServiceClient } from "@/lib/supabase";
import { getBenutzerProfil } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError, logInfo } from "@/lib/logger";

const BodySchema = z.object({
  besteller_kuerzel: z.string().min(1).max(10),
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

    const supabase = createTypedServiceClient();
    const { data: result, error } = await supabase
      .rpc("dsgvo_export_user_data", { p_kuerzel: besteller_kuerzel });

    if (error) {
      logError("/api/admin/dsgvo-export", "RPC-Fehler", error);
      return NextResponse.json({ error: "Export fehlgeschlagen", details: error.message }, { status: 500 });
    }

    const exportData = result as Record<string, unknown> | null;
    if (!exportData || (exportData as { error?: string }).error) {
      return NextResponse.json(
        { error: "Benutzer nicht gefunden", kuerzel: besteller_kuerzel },
        { status: 404 },
      );
    }

    logInfo("/api/admin/dsgvo-export", `DSGVO-Export ausgeführt für ${besteller_kuerzel}`, {
      executed_by: profil.kuerzel,
      counts: (exportData as { counts?: unknown }).counts,
    });

    // Audit-Log (Art. 30 Verzeichnis von Verarbeitungstätigkeiten)
    await supabase.from("webhook_logs").insert({
      typ: "admin",
      status: "success",
      fehler_text: `DSGVO-Export ausgeführt für besteller_kuerzel=${besteller_kuerzel} durch ${profil.kuerzel}`,
    });

    const today = new Date().toISOString().slice(0, 10);
    const filename = `dsgvo-export-${besteller_kuerzel}-${today}.json`;

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    logError("/api/admin/dsgvo-export", "Unerwarteter Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
