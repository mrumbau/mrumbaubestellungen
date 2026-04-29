import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { logError } from "@/lib/logger";
import { safeCompare } from "@/lib/safe-compare";

// POST /api/cron/cleanup – Täglicher Job:
// 1. Abgelaufene Extension-Signale als "expired" markieren (≥ stunden ohne Match)
// 2. Versand-only Bestellungen löschen (≥ stunden ohne weitere Dokumente)
//
// F3.E2: stunden in [24, 168] geklemmt, sonst Default 48.
// F3.E3: Versand-Only-Cleanup atomar via RPC delete_versand_only_bestellungen.

const BodySchema = z.object({
  secret: z.string().min(1),
  stunden: z.number().int().min(24).max(168).optional(),
}).passthrough();

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Body invalid", issues: parsed.error.issues }, { status: 400 });
    }
    const body = parsed.data;

    if (!safeCompare(body.secret, process.env.MAKE_WEBHOOK_SECRET)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    // F3.E2: Clamp + Default. Zod hat den Range schon validiert.
    const stunden = body.stunden ?? 48;
    const schwelleDatum = new Date(Date.now() - stunden * 60 * 60 * 1000).toISOString();

    // 1. Abgelaufene Signale als "expired" markieren
    const { data: abgelaufeneSignale } = await supabase
      .from("bestellung_signale")
      .update({ status: "expired" })
      .eq("status", "pending")
      .lt("zeitstempel", schwelleDatum)
      .select("id");

    const signaleExpired = abgelaufeneSignale?.length || 0;

    // 2. Versand-only Bestellungen identifizieren
    const { data: versandOnly } = await supabase
      .from("bestellungen")
      .select("id, bestellnummer, haendler_name")
      .eq("hat_versandbestaetigung", true)
      .eq("hat_bestellbestaetigung", false)
      .eq("hat_rechnung", false)
      .eq("hat_lieferschein", false)
      .in("status", ["offen"])
      .lt("created_at", schwelleDatum);

    let versandGeloescht = 0;
    if (versandOnly && versandOnly.length > 0) {
      const ids = versandOnly.map((b) => b.id);
      const auditDetails = versandOnly
        .map((b) => `${b.bestellnummer || "ohne-nr"} (${b.haendler_name || "unbekannt"})`)
        .join(", ");

      // Audit-Log VOR dem Delete (überlebt auch wenn RPC fehlschlägt)
      await supabase.from("webhook_logs").insert({
        typ: "cron_cleanup",
        status: "info",
        fehler_text: `Versand-only cleanup nach ${stunden}h: ${ids.length} Bestellungen → ${auditDetails}`,
      });

      // F3.E3: Atomic-Delete aller cascading Tables in einer Transaction
      const { data: deleted, error: rpcError } = await supabase
        .rpc("delete_versand_only_bestellungen", { p_ids: ids });

      if (rpcError) {
        logError("/api/cron/cleanup", "Atomic-Delete RPC fehlgeschlagen", rpcError);
        await supabase.from("webhook_logs").insert({
          typ: "cron",
          status: "error",
          fehler_text: `delete_versand_only_bestellungen RPC-Fehler: ${rpcError.message}`,
        });
      } else {
        versandGeloescht = typeof deleted === "number" ? deleted : ids.length;
      }
    }

    await supabase.from("webhook_logs").insert({
      typ: "cron",
      status: "success",
      fehler_text: `Cleanup: ${signaleExpired} Signale expired, ${versandGeloescht} Versand-only gelöscht`,
    });

    return NextResponse.json({
      success: true,
      signale_expired: signaleExpired,
      versand_geloescht: versandGeloescht,
    });
  } catch (err) {
    logError("/api/cron/cleanup", "Unerwarteter Fehler", err);

    try {
      const supabase = createServiceClient();
      await supabase.from("webhook_logs").insert({
        typ: "cron",
        status: "error",
        fehler_text: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    } catch { /* Log-Fehler nicht propagieren */ }

    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
