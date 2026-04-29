/**
 * R5c — KI-Abgleich (3-Wege)
 *
 * Aus webhook/email/route.ts (Z. 1658-1718) extrahiert.
 *
 * Wenn alle 3 Dokumente (Bestellbestätigung + Lieferschein + Rechnung)
 * für eine Material-Bestellung vorhanden sind, ruft GPT-4o den Abgleich
 * auf. Bei Abweichung: Status auf 'abweichung' setzen + Audit-Kommentar.
 *
 * Idempotent: Wenn schon ein Abgleich für die Bestellung existiert,
 * wird kein neuer angelegt.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fuehreAbgleichDurch, type DokumentAnalyse } from "@/lib/openai";
import { safeUpdateStatus } from "@/lib/bestellung-utils";
import { logError, logInfo } from "@/lib/logger";

export async function tryAbgleich(
  supabase: SupabaseClient,
  bestellungId: string,
): Promise<{ ranAbgleich: boolean; status?: "ok" | "abweichung" }> {
  try {
    const { data: aktuelle } = await supabase
      .from("bestellungen")
      .select("hat_bestellbestaetigung, hat_lieferschein, hat_rechnung, status")
      .eq("id", bestellungId)
      .maybeSingle();

    if (!aktuelle?.hat_bestellbestaetigung || !aktuelle?.hat_lieferschein || !aktuelle?.hat_rechnung) {
      return { ranAbgleich: false };
    }
    if (aktuelle.status === "abweichung") {
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

    const bb = dokumente?.find((d) => d.typ === "bestellbestaetigung")?.ki_roh_daten as DokumentAnalyse | null;
    const ls = dokumente?.find((d) => d.typ === "lieferschein")?.ki_roh_daten as DokumentAnalyse | null;
    const re = dokumente?.find((d) => d.typ === "rechnung")?.ki_roh_daten as DokumentAnalyse | null;

    if (!bb || !ls || !re) return { ranAbgleich: false };

    const ergebnis = await fuehreAbgleichDurch(bb, ls, re);
    await supabase.from("abgleiche").insert({
      bestellung_id: bestellungId,
      status: ergebnis.status,
      abweichungen: ergebnis.abweichungen,
      ki_zusammenfassung: ergebnis.zusammenfassung,
    });

    if (ergebnis.status === "abweichung") {
      await safeUpdateStatus(supabase, bestellungId, "abweichung", "abgleich/result");
      await supabase.from("kommentare").insert({
        bestellung_id: bestellungId,
        autor_kuerzel: "SYSTEM",
        autor_name: "KI-Abgleich",
        text: `Abweichungen erkannt: ${ergebnis.zusammenfassung}`,
      });
      logInfo("webhook/email/abgleich", "Abweichung erkannt", {
        bestellungId, anzahl: ergebnis.abweichungen.length,
      });
      return { ranAbgleich: true, status: "abweichung" };
    }

    logInfo("webhook/email/abgleich", "OK", { bestellungId });
    return { ranAbgleich: true, status: "ok" };
  } catch (e) {
    logError("webhook/email/abgleich", "fehlgeschlagen", e);
    return { ranAbgleich: false };
  }
}
