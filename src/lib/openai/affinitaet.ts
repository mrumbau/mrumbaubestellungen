/**
 * Besteller-Affinitäts-Scoring (deterministisch, KEIN KI-Call).
 *
 * `aktualisiereBestellerAffinitaet` läuft nach jeder Projekt-Zuordnung und
 * persistiert die neue Self-Learning-Quote in `projekte.besteller_affinitaet`.
 *
 * 19.05.2026 (A2.7) — aus openai.ts extrahiert. Verhalten unverändert.
 */
import { SupabaseClient } from "@supabase/supabase-js";

export async function aktualisiereBestellerAffinitaet(
  supabase: SupabaseClient,
  projektId: string
): Promise<void> {
  const { data: bestellungen } = await supabase
    .from("bestellungen")
    .select("besteller_kuerzel")
    .eq("projekt_id", projektId)
    .neq("besteller_kuerzel", "UNBEKANNT");

  if (!bestellungen || bestellungen.length === 0) return;

  const counts: Record<string, number> = {};
  for (const b of bestellungen) {
    counts[b.besteller_kuerzel] = (counts[b.besteller_kuerzel] || 0) + 1;
  }

  const gesamt = bestellungen.length;
  const affinitaet: Record<string, number> = {};
  for (const [kuerzel, anzahl] of Object.entries(counts)) {
    affinitaet[kuerzel] = Math.round((anzahl / gesamt) * 100) / 100;
  }

  await supabase
    .from("projekte")
    .update({ besteller_affinitaet: affinitaet })
    .eq("id", projektId);
}
