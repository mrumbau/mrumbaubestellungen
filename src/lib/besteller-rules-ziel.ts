/**
 * Pruefung des Regelziels (30.09.2026).
 *
 * Eine Auto-Zuordnungs-Regel zeigt auf ein Besteller-Kuerzel. Steht dort ein
 * Tippfehler oder jemand, der keine neuen Bestellungen mehr annimmt, greift
 * die Regel entweder nie oder — schlimmer — schickt Bestellungen an eine
 * Person, die sie nicht mehr bearbeitet. Beides faellt im Betrieb nicht auf,
 * weil eine Regel ohne Treffer genauso still ist wie gar keine Regel.
 *
 * Deshalb wird das Ziel beim Anlegen und Aendern gegen die Stammdaten
 * geprueft. Absichtlich nicht fail-open: hier entsteht Konfiguration, kein
 * laufender Mailverkehr — eine abgelehnte Eingabe ist harmlos, eine falsche
 * Regel laeuft monatelang mit.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Gibt eine Fehlermeldung zurueck, wenn das Kuerzel kein gueltiges Regelziel
 * ist — oder null, wenn alles passt.
 */
export async function pruefeZiel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  kuerzel: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("benutzer_rollen")
    .select("kuerzel, name, rolle, nimmt_neue_bestellungen")
    .eq("kuerzel", kuerzel)
    .maybeSingle();

  if (error) {
    return "Das Regelziel konnte nicht geprüft werden. Bitte noch einmal versuchen.";
  }
  if (!data) {
    return `„${kuerzel}" ist kein bekanntes Kürzel.`;
  }
  if (!["besteller", "admin"].includes(String(data.rolle))) {
    return `„${kuerzel}" ist kein Besteller — eine Regel kann nur an Besteller oder Admins zuweisen.`;
  }
  if (data.nimmt_neue_bestellungen === false) {
    return `${data.name} nimmt keine neuen Bestellungen mehr an. Bitte ein anderes Ziel wählen.`;
  }
  return null;
}
