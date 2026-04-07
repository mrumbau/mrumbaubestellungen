import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { logError } from "@/lib/logger";
import { safeCompare } from "@/lib/safe-compare";

// POST /api/cron/cleanup – Täglicher Job:
// 1. Abgelaufene Extension-Signale als "expired" markieren (48h ohne Match)
// 2. Versand-only Bestellungen löschen (48h ohne weitere Dokumente)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    if (!safeCompare(body.secret, process.env.MAKE_WEBHOOK_SECRET)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const stunden = body.stunden || 48;
    const schwelleDatum = new Date(Date.now() - stunden * 60 * 60 * 1000).toISOString();

    // 1. Abgelaufene Signale als "expired" markieren
    const { data: abgelaufeneSignale } = await supabase
      .from("bestellung_signale")
      .update({ status: "expired" })
      .eq("status", "pending")
      .lt("zeitstempel", schwelleDatum)
      .select("id");

    const signaleExpired = abgelaufeneSignale?.length || 0;

    // 2. Versand-only Bestellungen löschen (nur Versand, keine anderen Dokumente)
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
      await supabase.from("webhook_logs").delete().in("bestellung_id", ids);
      await supabase.from("kommentare").delete().in("bestellung_id", ids);
      await supabase.from("dokumente").delete().in("bestellung_id", ids);
      await supabase.from("bestellungen").delete().in("id", ids);
      versandGeloescht = ids.length;
    }

    // Log
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
