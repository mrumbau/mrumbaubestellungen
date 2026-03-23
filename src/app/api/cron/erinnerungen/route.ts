import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { generiereErinnerungsmail } from "@/lib/openai";
import { logError } from "@/lib/logger";
import { safeCompare } from "@/lib/safe-compare";

// POST /api/cron/erinnerungen – Täglicher Job: Fehlende Lieferscheine erkennen
// Aufruf durch Make.com oder Vercel Cron
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    // Secret prüfen
    if (!safeCompare(body.secret, process.env.MAKE_WEBHOOK_SECRET)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const schwelleTage = body.tage || 5;

    // Bestellungen finden die älter als X Tage sind und keinen Lieferschein haben
    const schwelleDatum = new Date(Date.now() - schwelleTage * 24 * 60 * 60 * 1000).toISOString();

    const { data: bestellungen } = await supabase
      .from("bestellungen")
      .select("id, bestellnummer, haendler_name, besteller_kuerzel, besteller_name, betrag, created_at")
      .eq("hat_lieferschein", false)
      .neq("bestellungsart", "subunternehmer")
      .in("status", ["offen", "ls_fehlt"])
      .lt("created_at", schwelleDatum)
      .order("created_at", { ascending: true });

    if (!bestellungen || bestellungen.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Keine Bestellungen mit fehlendem Lieferschein gefunden.",
        erinnerungen: 0,
      });
    }

    // Status auf ls_fehlt setzen wenn noch nicht geschehen
    const lsFehltIds = bestellungen
      .filter((b) => b.besteller_kuerzel !== "UNBEKANNT")
      .map((b) => b.id);

    if (lsFehltIds.length > 0) {
      const { error: updateError } = await supabase
        .from("bestellungen")
        .update({ status: "ls_fehlt", updated_at: new Date().toISOString() })
        .in("id", lsFehltIds);
      if (updateError) {
        logError("/api/cron/erinnerungen", "Batch-Update ls_fehlt fehlgeschlagen", updateError);
      }
    }

    // Gruppiere nach Besteller
    const bestellerGruppen = new Map<string, typeof bestellungen>();
    for (const b of bestellungen) {
      if (b.besteller_kuerzel === "UNBEKANNT") continue;
      if (!bestellerGruppen.has(b.besteller_kuerzel)) {
        bestellerGruppen.set(b.besteller_kuerzel, []);
      }
      bestellerGruppen.get(b.besteller_kuerzel)!.push(b);
    }

    const erinnerungen = [];

    for (const [kuerzel, gruppe] of bestellerGruppen) {
      // Besteller-Email holen
      const { data: benutzer } = await supabase
        .from("benutzer_rollen")
        .select("email, name")
        .eq("kuerzel", kuerzel)
        .single();

      if (!benutzer) continue;

      const bestellDaten = gruppe.map((b) => ({
        bestellnummer: b.bestellnummer || "Ohne Nr.",
        haendler: b.haendler_name || "Unbekannt",
        besteller: b.besteller_name,
        tage_alt: Math.floor((Date.now() - new Date(b.created_at).getTime()) / (24 * 60 * 60 * 1000)),
        betrag: Number(b.betrag) || 0,
      }));

      // KI-generierte Erinnerungsmail
      const mailText = await generiereErinnerungsmail(bestellDaten);

      erinnerungen.push({
        an_email: benutzer.email,
        an_name: benutzer.name,
        kuerzel,
        betreff: `Erinnerung: ${gruppe.length} Lieferschein${gruppe.length > 1 ? "e" : ""} fehlt noch`,
        text: mailText,
        bestellungen: bestellDaten,
      });
    }

    // Webhook-Log: Erfolg
    await supabase.from("webhook_logs").insert({
      typ: "cron",
      status: "success",
      fehler_text: `${erinnerungen.length} Erinnerung(en) generiert`,
    });

    return NextResponse.json({
      success: true,
      message: `${erinnerungen.length} Erinnerung${erinnerungen.length !== 1 ? "en" : ""} generiert.`,
      erinnerungen,
    });
  } catch (err) {
    logError("/api/cron/erinnerungen", "Unerwarteter Fehler", err);

    // Webhook-Log: Fehler
    try {
      const supabase = createServiceClient();
      await supabase.from("webhook_logs").insert({
        typ: "cron",
        status: "error",
        fehler_text: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    } catch { /* Log-Fehler nicht propagieren */ }

    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 }
    );
  }
}
