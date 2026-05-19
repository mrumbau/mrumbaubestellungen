/**
 * Besteller-Affinitäts-Scoring (deterministisch, KEIN KI-Call).
 *
 * `berechneAffinitaet` wird VOR `erkenneProjektAusInhalt` (extraction.ts)
 * als Stufe 0 geprüft — kostenloser Match wenn ein Besteller >50% einer
 * Projekt-Bestellungs-Quote hat.
 *
 * `aktualisiereBestellerAffinitaet` läuft nach jeder Projekt-Zuordnung und
 * persistiert die neue Self-Learning-Quote in `projekte.besteller_affinitaet`.
 *
 * 19.05.2026 (A2.7) — aus openai.ts extrahiert. Verhalten unverändert.
 */
import { SupabaseClient } from "@supabase/supabase-js";
import type { ProjektMatchErgebnis } from "./prompts";

// 12. Recency-Boost: Kürzlich aktive Projekte höher gewichten
function recencyBoost(letzteBestellung: string | null): number {
  if (!letzteBestellung) return 1.0;
  const tage = (Date.now() - new Date(letzteBestellung).getTime()) / (1000 * 60 * 60 * 24);
  if (tage <= 7) return 1.15;   // letzte Woche: +15%
  if (tage <= 30) return 1.05;  // letzter Monat: +5%
  if (tage > 90) return 0.85;   // > 3 Monate: -15%
  return 1.0;
}

// 13. Besteller-Affinität (deterministisch, kostenlos — wird VOR GPT geprüft)
export function berechneAffinitaet(
  bestellerKuerzel: string,
  projekte: { id: string; name: string; besteller_affinitaet: Record<string, number> | null; letzte_bestellung: string | null }[]
): ProjektMatchErgebnis | null {
  let maxAdjusted = 0;
  let affinitaetsProjekt: typeof projekte[0] | null = null;
  let rawAnteil = 0;

  for (const projekt of projekte) {
    if (!projekt.besteller_affinitaet) continue;
    const anteil = projekt.besteller_affinitaet[bestellerKuerzel] || 0;
    if (anteil < 0.5) continue;
    const adjusted = anteil * recencyBoost(projekt.letzte_bestellung);
    if (adjusted > maxAdjusted) {
      maxAdjusted = adjusted;
      affinitaetsProjekt = projekt;
      rawAnteil = anteil;
    }
  }

  if (affinitaetsProjekt && maxAdjusted > 0) {
    const konfidenz = Math.min(maxAdjusted * 0.80, 0.80);
    if (konfidenz >= 0.60) {
      return {
        projekt_id: affinitaetsProjekt.id,
        konfidenz,
        methode: "besteller_affinitaet",
        begruendung: `Besteller ${bestellerKuerzel} bestellt zu ${Math.round(rawAnteil * 100)}% für "${affinitaetsProjekt.name}"`,
      };
    }
  }
  return null;
}

// 14. Besteller-Affinität aktualisieren (Self-Learning)
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
