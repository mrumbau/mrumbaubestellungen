/**
 * Post-Bestellungs-Cleanup (Schritte 16b + 16c).
 *
 *   16b. Sanity-Check: leere Bestellung (kein Doku-Record nach allen Fallbacks)
 *        → komplett löschen + skip-Response.
 *
 *   16c. Bestellnummer/Betrag-Propagation: wenn die Bestellung noch keine
 *        Bestellnummer hat aber ein Doku-Record schon eine erkannt hat
 *        → übernehmen. Behebt: "Bestellung Ohne Nr." trotz Anhang-BN.
 *
 * 19.05.2026 (A2.1) — aus run.ts extrahiert. Verhalten unverändert.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logInfo } from "@/lib/logger";

export interface SanityInput {
  bestellungId: string;
  bestellungNeuErstellt: boolean;
  dokumenteGespeichert: number;
  email_absender: string;
  email_betreff: string;
}

export interface SanityResult {
  shouldShortCircuit: boolean;
  reason?: string;
}

/**
 * Sanity-Check: Bestellungen MÜSSEN mindestens einen Doku-Record haben.
 * Wenn die Pipeline trotz aller Fallbacks keinen einzigen Doku-Record erstellt
 * hat, ist die Bestellung leer und unverwendbar — automatisch löschen statt
 * im UI als "Ohne Nr. + 0/3 Doku" zu erscheinen.
 */
export async function sanityCleanupLeereBestellung(
  supabase: SupabaseClient,
  input: SanityInput,
): Promise<SanityResult> {
  const { bestellungId, bestellungNeuErstellt, dokumenteGespeichert, email_absender, email_betreff } = input;
  if (bestellungNeuErstellt && dokumenteGespeichert === 0) {
    logInfo("webhook/email", "Sanity-Cleanup: leere Bestellung gelöscht (kein Doku-Record erstellt)", {
      bestellungId, email_absender, email_betreff,
    });
    await supabase.from("dokumente").delete().eq("bestellung_id", bestellungId);
    await supabase.from("bestellungen").delete().eq("id", bestellungId);
    return { shouldShortCircuit: true, reason: "leer_kein_doku_record" };
  }
  return { shouldShortCircuit: false };
}

/**
 * Bestellnummer-Propagation: Wenn die Bestellung selbst noch keine
 * Bestellnummer hat aber irgendein Doku-Record eine erkannt hat, übernehmen.
 * Behebt: "Bestellung Ohne Nr." obwohl PDF-Anhang die Nummer enthielt.
 */
export async function propagiereBestellnummerAusDoku(
  supabase: SupabaseClient,
  bestellungId: string,
): Promise<void> {
  const { data: bestellungAktuell } = await supabase
    .from("bestellungen")
    .select("bestellnummer, betrag")
    .eq("id", bestellungId)
    .maybeSingle();

  const bestellungUpdate: Record<string, unknown> = {};
  if (!bestellungAktuell?.bestellnummer) {
    const { data: dokuMitNr } = await supabase
      .from("dokumente")
      .select("bestellnummer_erkannt, gesamtbetrag")
      .eq("bestellung_id", bestellungId)
      .not("bestellnummer_erkannt", "is", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (dokuMitNr?.bestellnummer_erkannt) {
      bestellungUpdate.bestellnummer = dokuMitNr.bestellnummer_erkannt;
      if (!bestellungAktuell?.betrag && dokuMitNr.gesamtbetrag) {
        bestellungUpdate.betrag = dokuMitNr.gesamtbetrag;
      }
    }
  }
  if (Object.keys(bestellungUpdate).length > 0) {
    bestellungUpdate.updated_at = new Date().toISOString();
    await supabase.from("bestellungen").update(bestellungUpdate).eq("id", bestellungId);
    logInfo("webhook/email", "Bestellnummer/Betrag aus Doku-Record propagiert", {
      bestellungId, ...bestellungUpdate,
    });
  }
}
