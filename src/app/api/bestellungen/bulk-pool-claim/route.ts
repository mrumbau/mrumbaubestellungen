/**
 * POST /api/bestellungen/bulk-pool-claim
 *
 * Pool-Phase-6 (02.06.2026): Mehrere UNBEKANNT-Material-Bestellungen in einem
 * Schritt übernehmen. Dünner Wrapper um die Single-RPC pool_claim_bestellung —
 * iteriert über die IDs und sammelt die Per-Item-Outcomes auf.
 *
 * Race-safe: jedes Item geht durch die idempotente RPC, die per WHERE-Clause
 * gegen schon-claimed schützt. Verlierer-IDs landen im `was_already_claimed`-
 * Bucket, der Client zeigt ein "X übernommen, Y waren schon vergeben"-Toast.
 *
 * Limit: 100 IDs pro Request (analog bulk-freigeben). Sequential ausgeführt,
 * weil pool_claim_bestellung ein einzelnes UPDATE+Event ist (~5-20ms je RPC).
 * Bei 100 Items realistisch ~1-2s — akzeptabel für Bulk-UX.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError, logInfo } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";

const ROUTE_TAG = "/api/bestellungen/bulk-pool-claim";

const BodySchema = z.object({
  ids: z
    .array(z.string().uuid())
    .min(1, "Mindestens eine ID erforderlich")
    .max(100, "Maximal 100 Bestellungen pro Bulk-Aktion"),
});

interface BulkPoolClaimResult {
  total: number;
  claimed: string[];
  was_already_claimed: { id: string; current_owner: string | null }[];
  no_permission: string[];
  errors: { id: string; reason: string }[];
}

export async function POST(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const auth = await requireAuth(["admin", "besteller"]);
    if (auth.response) return auth.response;

    const body = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Daten", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { ids } = parsed.data;

    const supabase = await createServerSupabaseClient();
    const result: BulkPoolClaimResult = {
      total: ids.length,
      claimed: [],
      was_already_claimed: [],
      no_permission: [],
      errors: [],
    };

    for (const id of ids) {
      const { data, error } = await supabase.rpc("pool_claim_bestellung", {
        p_bestellung_id: id,
      });
      if (error) {
        logError(ROUTE_TAG, "RPC-Fehler", { id, message: error.message });
        result.errors.push({ id, reason: error.message });
        continue;
      }
      const r = (data ?? {}) as {
        success?: boolean;
        was_already_claimed?: boolean;
        current_owner?: string | null;
        error?: string;
      };
      if (r.success === true) {
        result.claimed.push(id);
      } else if (r.was_already_claimed) {
        result.was_already_claimed.push({ id, current_owner: r.current_owner ?? null });
      } else if (r.error === "keine_berechtigung") {
        result.no_permission.push(id);
      } else {
        result.errors.push({ id, reason: r.error ?? "unknown" });
      }
    }

    logInfo(ROUTE_TAG, "Bulk-Pool-Claim abgeschlossen", {
      total: result.total,
      claimed: result.claimed.length,
      already: result.was_already_claimed.length,
      errors: result.errors.length,
      actor: auth.profil.kuerzel,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    logError(ROUTE_TAG, "Unerwarteter Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
