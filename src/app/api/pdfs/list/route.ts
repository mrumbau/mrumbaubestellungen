/**
 * GET /api/pdfs/list?bestellung_id=X&typ=Y
 *
 * Liefert alle Dokumente einer Bestellung vom angegebenen Typ als
 * leichtgewichtiges JSON-Metadaten-Array. Verwendet von der PDF-Preview-
 * Modal-Komponente um Multi-Doc-Bestellungen (z.B. Raab-Karcher-
 * Sammelrechnungen mit 2 Rechnungs-PDFs) zu paginieren.
 *
 * 12.05.2026 — User-Feedback: "bei Einträgen die 2 Rechnungen haben sollte
 * man auch bei PDF-Vorschau das auch sehen". Vorher zeigte das Modal nur die
 * neueste, jetzt: Liste laden + Prev/Next-Navigation in der UI.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID } from "@/lib/validation";
import { ERRORS } from "@/lib/errors";
import { requireAuth } from "@/lib/require-auth";

const ALLOWED_TYPEN = new Set([
  "bestellbestaetigung",
  "lieferschein",
  "rechnung",
  "versandbestaetigung",
  "aufmass",
  "leistungsnachweis",
]);

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(["admin", "besteller", "buchhaltung"]);
    if (auth.response) return auth.response;

    const bestellungId = request.nextUrl.searchParams.get("bestellung_id");
    const typ = request.nextUrl.searchParams.get("typ");

    if (!bestellungId || !isValidUUID(bestellungId)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }
    if (!typ || !ALLOWED_TYPEN.has(typ)) {
      return NextResponse.json({ error: "Ungültiger Dokumenttyp" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();

    // RLS-Check: kann der User die Bestellung überhaupt sehen?
    const { data: bestellung } = await supabase
      .from("bestellungen")
      .select("id")
      .eq("id", bestellungId)
      .maybeSingle();

    if (!bestellung) {
      return NextResponse.json({ error: ERRORS.NICHT_GEFUNDEN }, { status: 404 });
    }

    const { data: docs, error } = await supabase
      .from("dokumente")
      .select("id, created_at, gesamtbetrag, storage_pfad")
      .eq("bestellung_id", bestellungId)
      .eq("typ", typ)
      .not("storage_pfad", "is", null)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json({
      docs: (docs ?? []).map((d) => ({
        id: d.id,
        created_at: d.created_at,
        gesamtbetrag: d.gesamtbetrag,
      })),
    });
  } catch {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
