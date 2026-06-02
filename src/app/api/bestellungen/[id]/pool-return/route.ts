import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";

/**
 * POST /api/bestellungen/[id]/pool-return
 *
 * Pool-Phase-1 (02.06.2026): Aktiver Owner (oder Admin) gibt die Bestellung
 * zurück in den Pool (besteller_kuerzel → 'UNBEKANNT'). Nicht erlaubt nach
 * Freigabe. Wrapper um `pool_return_to_pool`-RPC.
 *
 * Body: { kommentar?: string }
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
    const kommentar = typeof body?.kommentar === "string" ? body.kommentar.slice(0, 500) : null;

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("pool_return_to_pool", {
      p_bestellung_id: id,
      p_kommentar: kommentar,
    });

    if (error) {
      logError("pool-return", "RPC fehlgeschlagen", { id, message: error.message });
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e) {
    logError("pool-return", "Unerwarteter Fehler", e);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
