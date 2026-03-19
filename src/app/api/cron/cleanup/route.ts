import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { logError } from "@/lib/logger";

// POST /api/cron/cleanup – Täglicher Job: Verwaiste "erwartet"-Bestellungen aufräumen
// Bestellungen mit Status "erwartet" die nach 48h kein einziges Dokument erhalten haben,
// werden automatisch gelöscht. Das passiert z.B. wenn die Extension ein Signal sendet,
// aber keine Bestellung tatsächlich aufgegeben wurde.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    if (body.secret !== process.env.MAKE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const stunden = body.stunden || 48;
    const schwelleDatum = new Date(Date.now() - stunden * 60 * 60 * 1000).toISOString();

    // Finde "erwartet"-Bestellungen die älter als 48h sind
    const { data: verwaiste } = await supabase
      .from("bestellungen")
      .select("id, bestellnummer, haendler_name, besteller_kuerzel, created_at, hat_bestellbestaetigung, hat_lieferschein, hat_rechnung, hat_aufmass, hat_leistungsnachweis")
      .eq("status", "erwartet")
      .lt("created_at", schwelleDatum);

    if (!verwaiste || verwaiste.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Keine verwaisten Bestellungen gefunden.",
        geloescht: 0,
      });
    }

    // Nur Bestellungen löschen die KEIN Dokument haben
    const zuLoeschen = verwaiste.filter(
      (b) => !b.hat_bestellbestaetigung && !b.hat_lieferschein && !b.hat_rechnung && !b.hat_aufmass && !b.hat_leistungsnachweis
    );

    if (zuLoeschen.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Alle erwartet-Bestellungen haben bereits Dokumente.",
        geloescht: 0,
      });
    }

    const ids = zuLoeschen.map((b) => b.id);

    // Zugehörige Signale als verarbeitet markieren
    // (Signale löschen wir nicht, nur die Bestellungen)

    // Dokumente löschen (sollte keine geben, aber sicherheitshalber)
    await supabase.from("dokumente").delete().in("bestellung_id", ids);

    // Abgleiche löschen
    await supabase.from("abgleiche").delete().in("bestellung_id", ids);

    // Kommentare löschen
    await supabase.from("kommentare").delete().in("bestellung_id", ids);

    // Bestellungen löschen
    const { error: deleteError } = await supabase
      .from("bestellungen")
      .delete()
      .in("id", ids);

    if (deleteError) {
      logError("/api/cron/cleanup", "Löschen fehlgeschlagen", deleteError);
      return NextResponse.json({ error: "Löschen fehlgeschlagen" }, { status: 500 });
    }

    // Log
    const details = zuLoeschen.map(
      (b) => `${b.bestellnummer || "Ohne Nr."} (${b.haendler_name || "?"}, ${b.besteller_kuerzel})`
    );

    await supabase.from("webhook_logs").insert({
      typ: "cron",
      status: "success",
      fehler_text: `Cleanup: ${zuLoeschen.length} verwaiste Bestellung(en) gelöscht: ${details.join(", ")}`,
    });

    return NextResponse.json({
      success: true,
      message: `${zuLoeschen.length} verwaiste Bestellung(en) gelöscht.`,
      geloescht: zuLoeschen.length,
      details,
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
