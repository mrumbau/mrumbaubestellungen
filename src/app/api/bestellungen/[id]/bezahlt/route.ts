import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { ERRORS } from "@/lib/errors";
import { logInfo } from "@/lib/logger";

// 07.05.2026 — DEPRECATED.
//
// Bezahlt-Tracking ist jetzt PRO RECHNUNGS-DOKUMENT, nicht pro Bestellung.
// Eine Sammel-Bestellung (Raab Karcher etc.) kann mehrere Teilrechnungen haben,
// jede mit eigenem Bezahlt-Status / Fälligkeit / DATEV-Buchungssatz. Der alte
// Endpoint hätte diese Granularität verloren.
//
// Neuer Pfad: POST /api/dokumente/[id]/bezahlt
//
// Wir antworten mit 410 Gone statt komplett zu löschen, damit ältere Skripte/
// Webhooks/Make-Szenarien einen klaren Fehler bekommen statt stillschweigend
// am alten Pfad weiterzulaufen.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Audit-Trail: wer ruft den deprecated Endpoint? Dann gezielt fixen.
  try {
    const sb = createServiceClient();
    await sb.from("webhook_logs").insert({
      typ: "api",
      status: "warning",
      bestellung_id: id,
      fehler_text: `Deprecated /api/bestellungen/[id]/bezahlt aufgerufen (UA: ${request.headers.get("user-agent")?.slice(0, 100) ?? "?"}). Migrate auf /api/dokumente/[id]/bezahlt.`,
    });
  } catch { /* Logging-Fehler nicht propagieren */ }

  logInfo("/api/bestellungen/[id]/bezahlt", "Deprecated endpoint called", {
    bestellung_id: id,
  });

  return NextResponse.json(
    {
      error: "Endpoint deaktiviert",
      grund: "Bezahlt-Tracking ist jetzt pro Rechnungs-Dokument. Nutze POST /api/dokumente/{rechnungs_doku_id}/bezahlt.",
      neuer_pfad: "/api/dokumente/[id]/bezahlt",
      hint: ERRORS.NICHT_GEFUNDEN,
    },
    { status: 410 },
  );
}
