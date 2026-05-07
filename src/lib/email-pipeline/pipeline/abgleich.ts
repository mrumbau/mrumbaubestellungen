/**
 * KI-Abgleich (Mindestens Lieferschein + Rechnung).
 *
 * 07.05.2026 — Pflicht-Doku reduziert auf Lieferschein + Rechnung. Die
 * Bestellbestätigung ist optional (wird durchgereicht falls vorhanden, KI
 * nutzt sie für Cross-Check). Vorher mussten alle 3 Dokus da sein, was bei
 * vielen Lieferanten (kein BB-Mailversand) den Abgleich nie auslöste.
 *
 * Idempotent: Wenn schon ein Abgleich existiert, wird kein neuer angelegt.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fuehreAbgleichDurch, type DokumentAnalyse } from "@/lib/openai";
import { logError, logInfo } from "@/lib/logger";

export async function tryAbgleich(
  supabase: SupabaseClient,
  bestellungId: string,
): Promise<{ ranAbgleich: boolean; status?: "ok" | "abweichung" }> {
  try {
    const { data: aktuelle } = await supabase
      .from("bestellungen")
      .select("hat_lieferschein, hat_rechnung, status")
      .eq("id", bestellungId)
      .maybeSingle();

    // Mindestanforderung: Lieferschein UND Rechnung
    if (!aktuelle?.hat_lieferschein || !aktuelle?.hat_rechnung) {
      return { ranAbgleich: false };
    }

    const { data: existierend } = await supabase
      .from("abgleiche")
      .select("id")
      .eq("bestellung_id", bestellungId)
      .maybeSingle();
    if (existierend) {
      return { ranAbgleich: false };
    }

    const { data: dokumente } = await supabase
      .from("dokumente")
      .select("typ, ki_roh_daten")
      .eq("bestellung_id", bestellungId)
      .in("typ", ["bestellbestaetigung", "lieferschein", "rechnung"]);

    // BB optional, LS + RG Pflicht
    const bb = dokumente?.find((d) => d.typ === "bestellbestaetigung")?.ki_roh_daten as DokumentAnalyse | null;
    const ls = dokumente?.find((d) => d.typ === "lieferschein")?.ki_roh_daten as DokumentAnalyse | null;
    const re = dokumente?.find((d) => d.typ === "rechnung")?.ki_roh_daten as DokumentAnalyse | null;

    if (!ls || !re) return { ranAbgleich: false };

    const ergebnis = await fuehreAbgleichDurch(bb, ls, re);
    await supabase.from("abgleiche").insert({
      bestellung_id: bestellungId,
      status: ergebnis.status,
      abweichungen: ergebnis.abweichungen,
      ki_zusammenfassung: ergebnis.zusammenfassung,
    });

    if (ergebnis.status === "abweichung") {
      // Status-Wechsel auf "abweichung" wurde 07.05.2026 entfernt — Information
      // bleibt im abgleiche-Record + UI zeigt "Abweichungen erkannt"-Banner.
      await supabase.from("kommentare").insert({
        bestellung_id: bestellungId,
        autor_kuerzel: "SYSTEM",
        autor_name: "KI-Abgleich",
        text: `Abweichungen erkannt: ${ergebnis.zusammenfassung}`,
      });
      logInfo("webhook/email/abgleich", "Abweichung erkannt", {
        bestellungId, anzahl: ergebnis.abweichungen.length,
        bb_vorhanden: !!bb,
      });
      return { ranAbgleich: true, status: "abweichung" };
    }

    logInfo("webhook/email/abgleich", "OK", { bestellungId, bb_vorhanden: !!bb });
    return { ranAbgleich: true, status: "ok" };
  } catch (e) {
    logError("webhook/email/abgleich", "fehlgeschlagen", e);
    return { ranAbgleich: false };
  }
}
