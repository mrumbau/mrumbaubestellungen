import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID, isValidKuerzel } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";

/**
 * POST /api/bestellungen/[id]/pool-reassign
 *
 * Pool-Phase-1 (02.06.2026): Aktiver Owner (oder Admin) gibt die Bestellung an
 * einen anderen Besteller weiter. Wrapper um `pool_reassign_bestellung`-RPC.
 *
 * Body: { neuer_kuerzel: string, kommentar?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const { id } = await params;
    if (!isValidUUID(id)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGE_ID }, { status: 400 });
    }

    const auth = await requireAuth(["admin", "besteller"]);
    if (auth.response) return auth.response;

    const body = await request.json().catch(() => ({}));
    const neuerKuerzel = typeof body?.neuer_kuerzel === "string" ? body.neuer_kuerzel : null;
    const kommentar = typeof body?.kommentar === "string" ? body.kommentar.slice(0, 500) : null;

    if (!neuerKuerzel || !isValidKuerzel(neuerKuerzel)) {
      return NextResponse.json({ error: "Ungültiges Kürzel" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("pool_reassign_bestellung", {
      p_bestellung_id: id,
      p_neuer_kuerzel: neuerKuerzel,
      p_kommentar: kommentar,
    });

    if (error) {
      logError("pool-reassign", "RPC fehlgeschlagen", {
        id,
        neuer_kuerzel: neuerKuerzel,
        message: error.message,
      });
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e) {
    logError("pool-reassign", "Unerwarteter Fehler", e);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
