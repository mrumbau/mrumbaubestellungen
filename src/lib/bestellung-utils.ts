import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Berechnet und aktualisiert den Status einer Bestellung
 * basierend auf vorhandenen Dokumenten.
 * Wird in webhook/email und scan verwendet.
 */
export async function updateBestellungStatus(
  supabase: SupabaseClient,
  bestellungId: string
): Promise<string> {
  const { data: bestellung } = await supabase
    .from("bestellungen")
    .select("hat_bestellbestaetigung, hat_lieferschein, hat_rechnung")
    .eq("id", bestellungId)
    .single();

  const neuerStatus =
    bestellung?.hat_bestellbestaetigung &&
    bestellung?.hat_lieferschein &&
    bestellung?.hat_rechnung
      ? "vollstaendig"
      : "offen";

  await supabase
    .from("bestellungen")
    .update({ status: neuerStatus })
    .eq("id", bestellungId);

  return neuerStatus;
}
