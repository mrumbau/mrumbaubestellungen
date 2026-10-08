/**
 * POST /api/eingang/sichten — Mails im Eingang als gesichtet markieren.
 *
 * 03.10.2026 (Umbau 1) — Entscheidung von MH: Im Rechnungsordner muss
 * Aussortiertes gesichtet werden, bevor es verschwindet. "Gesichtet" heisst:
 * ein Mensch hat die Mail gesehen und bewusst beiseitegelegt. Erst dann
 * zaehlt sie nicht mehr als offen und faellt aus dem Zaehler in der
 * Navigation.
 *
 * Service-Client, weil email_processing_log nur fuer Admins schreibbar ist
 * und das Sichten ausdruecklich auch Besteller und Geschaeftsfuehrung tun
 * sollen. Die Rolle wird davor geprueft.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";
import { SICHTEN_MAX, postgrestListe } from "@/lib/eingang";
import { navZaehlerVergessen } from "@/lib/nav-zaehler";

const BodySchema = z.object({
  ids: z.array(z.string().min(1).max(500)).min(1).max(SICHTEN_MAX),
  /** false = Sichtung zuruecknehmen (Mail gilt wieder als offen). */
  gesichtet: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }
    const auth = await requireAuth(["admin", "besteller"]);
    if (auth.response) return auth.response;

    const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige Daten" }, { status: 400 });
    }
    const { ids, gesichtet } = parsed.data;

    const supabase = createServiceClient();
    // Die Sicht liefert als id graph_message_id ODER internet_message_id —
    // beide Spalten abfragen, damit jede Zeile getroffen wird.
    const { data, error } = await supabase
      .from("email_processing_log")
      .update({
        gesichtet_am: gesichtet ? new Date().toISOString() : null,
        gesichtet_von: gesichtet ? auth.profil.kuerzel : null,
      })
      .or(`graph_message_id.in.(${postgrestListe(ids)}),internet_message_id.in.(${postgrestListe(ids)})`)
      .is("bestellung_id", null)
      .select("internet_message_id");

    if (error) {
      logError("/api/eingang/sichten", "Update fehlgeschlagen", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    navZaehlerVergessen();
    return NextResponse.json({ gesichtet: data?.length ?? 0 });
  } catch (err) {
    logError("/api/eingang/sichten", "Unerwarteter Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
