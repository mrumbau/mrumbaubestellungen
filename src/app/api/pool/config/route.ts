import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";

/**
 * PUT /api/pool/config — Admin-Patch für Pool-2.0 Settings.
 *
 * 03.06.2026 (Pool 2.0 Sprint 3): Idempotent über firma_einstellungen mit
 * `schluessel`-Unique-Constraint. Auth-Gate: Admin only.
 *
 * Body:
 *   {
 *     enabled: boolean,
 *     threshold: number 0..1,
 *     methods: string[],
 *     weights: { age, urgency, vorschlag_konf, projekt_aff, vendor_aff },
 *     top_x_threshold: number 0..1
 *   }
 */
const WeightsSchema = z.object({
  age: z.number().min(0).max(2),
  urgency: z.number().min(0).max(2),
  vorschlag_konf: z.number().min(0).max(2),
  projekt_aff: z.number().min(0).max(2),
  vendor_aff: z.number().min(0).max(2),
});

const BodySchema = z.object({
  enabled: z.boolean(),
  threshold: z.number().min(0).max(1),
  methods: z.array(z.string().min(1).max(64)).max(20),
  weights: WeightsSchema,
  top_x_threshold: z.number().min(0).max(1),
});

export async function PUT(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }
    const auth = await requireAuth(["admin"]);
    if (auth.response) return auth.response;

    let body: z.infer<typeof BodySchema>;
    try {
      body = BodySchema.parse(await request.json());
    } catch {
      return NextResponse.json({ error: "Ungültiges Format" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();

    const upserts = [
      { schluessel: "pool_auto_claim_enabled", wert: String(body.enabled) },
      { schluessel: "pool_auto_claim_threshold", wert: body.threshold.toFixed(2) },
      { schluessel: "pool_auto_claim_methods", wert: body.methods.join(",") },
      { schluessel: "pool_score_weights", wert: JSON.stringify(body.weights) },
      { schluessel: "pool_score_top_x_threshold", wert: body.top_x_threshold.toFixed(2) },
    ];

    const { error } = await supabase
      .from("firma_einstellungen")
      .upsert(upserts, { onConflict: "schluessel" });

    if (error) {
      logError("/api/pool/config", "Upsert fehlgeschlagen", error);
      return NextResponse.json({ error: "Speichern fehlgeschlagen" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logError("/api/pool/config", "Unerwarteter Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
