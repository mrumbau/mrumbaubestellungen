/**
 * R5c — Abo-Logik
 *
 * Aus webhook/email/route.ts (Z. 1780-1851) extrahiert.
 *
 * Bei Abo-Rechnungen:
 * 1. Betragsabweichung prüfen (Toleranz aus abo_anbieter.toleranz_prozent,
 *    default 10%) → bei Abweichung Status auf 'abweichung'.
 * 2. naechste_rechnung weiterschalten basierend auf Intervall (vom geplanten
 *    Datum, nicht von heute — verhindert Drift).
 * 3. letzte_rechnung_am + letzter_betrag aktualisieren.
 *
 * Status-Setzung: Wenn Betrag passt → vollstaendig (Abo-Rechnung ist
 * mit Eingang sofort vollständig, kein Lieferschein nötig).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { safeUpdateStatus } from "@/lib/bestellung-utils";
import { logInfo } from "@/lib/logger";

const INTERVAL_MONATE: Record<string, number> = {
  monatlich: 1,
  quartalsweise: 3,
  halbjaehrlich: 6,
  jaehrlich: 12,
};

export async function handleAboLogik(
  supabase: SupabaseClient,
  bestellungId: string,
  haendlerDomain: string,
  haendlerName: string | null,
): Promise<void> {
  // Abo-Anbieter laden: zuerst per Domain, dann per Name
  let abo = (
    await supabase.from("abo_anbieter").select("*").eq("domain", haendlerDomain).maybeSingle()
  ).data;

  if (!abo && haendlerName) {
    abo = (
      await supabase.from("abo_anbieter").select("*").ilike("name", `%${haendlerName}%`).maybeSingle()
    ).data;
  }
  if (!abo) return;

  const { data: bestellung } = await supabase
    .from("bestellungen")
    .select("betrag")
    .eq("id", bestellungId)
    .maybeSingle();

  const aktuellerBetrag = bestellung?.betrag ? Number(bestellung.betrag) : null;

  // 1. Betragsabweichung prüfen
  if (abo.erwarteter_betrag && aktuellerBetrag) {
    const toleranz = (abo.toleranz_prozent || 10) / 100;
    const abweichung =
      Math.abs(aktuellerBetrag - Number(abo.erwarteter_betrag)) / Number(abo.erwarteter_betrag);
    if (abweichung > toleranz) {
      await safeUpdateStatus(supabase, bestellungId, "abweichung", "abo/abweichung");
      await supabase.from("kommentare").insert({
        bestellung_id: bestellungId,
        autor_kuerzel: "SYSTEM",
        autor_name: "Abo-Prüfung",
        text:
          `Abo-Betragsabweichung erkannt!\n` +
          `Erwartet: ${Number(abo.erwarteter_betrag).toLocaleString("de-DE", { minimumFractionDigits: 2 })} € (±${abo.toleranz_prozent || 10}%)\n` +
          `Erhalten: ${aktuellerBetrag.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €\n` +
          `Abweichung: ${(abweichung * 100).toFixed(1)}%`,
      });
      logInfo("webhook/email/abo", `Abweichung: ${abo.name}`, {
        erwartet: abo.erwarteter_betrag,
        erhalten: aktuellerBetrag,
      });
    } else {
      // Betrag passt → vollständig (löst auch alte 'abweichung' auf)
      await safeUpdateStatus(supabase, bestellungId, "vollstaendig", "abo/vollstaendig");
    }
  } else {
    // Kein erwarteter Betrag → Abo-Rechnung sofort vollständig
    await safeUpdateStatus(supabase, bestellungId, "vollstaendig", "abo/vollstaendig");
  }

  // 2. Nächste Rechnung weiterschalten (vom geplanten Datum, kein Drift)
  const monate = INTERVAL_MONATE[abo.intervall] || 1;
  const heute = new Date();
  let naechste: Date;
  if (abo.naechste_rechnung) {
    const geplant = new Date(abo.naechste_rechnung);
    naechste = new Date(geplant.getFullYear(), geplant.getMonth() + monate, geplant.getDate());
  } else {
    naechste = new Date(heute.getFullYear(), heute.getMonth() + monate, heute.getDate());
  }

  await supabase
    .from("abo_anbieter")
    .update({
      naechste_rechnung: naechste.toISOString().split("T")[0],
      letzte_rechnung_am: heute.toISOString().split("T")[0],
      letzter_betrag: aktuellerBetrag,
    })
    .eq("id", abo.id);
}
