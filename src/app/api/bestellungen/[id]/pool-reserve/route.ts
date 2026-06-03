import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";

/**
 * POST /api/bestellungen/[id]/pool-reserve
 *
 * Pool-2.0 Sprint 2 (03.06.2026): Soft-Reserve auf ein Pool-Item.
 * Drawer-Hook ruft auf bei Open (source='drawer_open'), refresht alle 4 min
 * und lockt beim Schließen wieder los. Reserve ist KEIN Lock — sie ist
 * Awareness ("Ich schaue mir das an"); Claim bleibt parallel erlaubt.
 *
 * Body: { source?: 'manual'|'drawer_open'|'swipe', ttl_minutes?: number }
 *
 * Antwort:
 *   200 { success:true, expires_at, refreshed?, stole_from_expired? }
 *   200 { success:false, error:'andere_reservierung', current_holder:{kuerzel,name,expires_at} }
 *   400/401/403/500 wie sonst
 */
const BodySchema = z.object({
  source: z.enum(["manual", "drawer_open", "swipe"]).optional(),
  ttl_minutes: z.number().int().min(1).max(60).optional(),
});

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

    // body parsen — tolerieren auch komplett leere bodies (sendBeacon mit "{}")
    let body: z.infer<typeof BodySchema> = {};
    try {
      const json = await request.json();
      body = BodySchema.parse(json);
    } catch {
      // empty body or invalid JSON → defaults
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.rpc("pool_reserve_bestellung", {
      p_bestellung_id: id,
      p_source: body.source ?? "manual",
      p_ttl_minutes: body.ttl_minutes ?? undefined,
    });

    if (error) {
      logError("pool-reserve", "RPC fehlgeschlagen", { id, message: error.message });
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e) {
    logError("pool-reserve", "Unerwarteter Fehler", e);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
