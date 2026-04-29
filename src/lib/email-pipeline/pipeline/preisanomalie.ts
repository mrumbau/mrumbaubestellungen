/**
 * R5c — Preisanomalie-Check
 *
 * Aus webhook/email/route.ts (Z. 1720-1778) extrahiert.
 *
 * Bei neuen Rechnungen: Vergleich mit historischen Rechnungen vom gleichen
 * Händler. Erst ab 3+ historischen Rechnungen sinnvoll. KI-Bewertung pro
 * Artikel (gpt-4o-mini seit R2.4).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { pruefePreisanomalien, type DokumentAnalyse } from "@/lib/openai";
import { logError, logInfo } from "@/lib/logger";
import type { AnalyseErgebnis } from "./anhang-analyse";

export async function tryPreisanomalieCheck(
  supabase: SupabaseClient,
  bestellungId: string,
  haendlerName: string | null,
  analyseErgebnisse: AnalyseErgebnis[],
): Promise<void> {
  if (!haendlerName) return;

  const neueRechnung = analyseErgebnisse.find((e) => e.analyse.typ === "rechnung");
  const neueArtikel = neueRechnung?.analyse.artikel || [];
  if (neueArtikel.length === 0) return;

  try {
    const { data: historieRechnungen } = await supabase
      .from("dokumente")
      .select("artikel")
      .eq("typ", "rechnung")
      .neq("bestellung_id", bestellungId)
      .not("artikel", "is", null)
      .limit(20);

    if (!historieRechnungen || historieRechnungen.length < 3) return;

    const preisHistorie: Record<string, number[]> = {};
    for (const rechnung of historieRechnungen) {
      const artikel = rechnung.artikel as { name: string; einzelpreis: number }[] | null;
      if (!Array.isArray(artikel)) continue;
      for (const a of artikel) {
        if (a.name && typeof a.einzelpreis === "number" && a.einzelpreis > 0) {
          if (!preisHistorie[a.name]) preisHistorie[a.name] = [];
          preisHistorie[a.name].push(a.einzelpreis);
        }
      }
    }

    const historischeArr = Object.entries(preisHistorie)
      .filter(([, preise]) => preise.length >= 2)
      .map(([name, preise]) => ({ name, preise }));

    if (historischeArr.length === 0) return;

    type Artikel = NonNullable<DokumentAnalyse["artikel"]>[number];
    const aktuelleArtikel = neueArtikel
      .filter((a: Artikel) => a.name && typeof a.einzelpreis === "number" && a.einzelpreis > 0)
      .map((a: Artikel) => ({
        name: a.name,
        einzelpreis: a.einzelpreis as number,
        menge: typeof a.menge === "number" ? a.menge : 1,
      }));

    if (aktuelleArtikel.length === 0) return;

    const anomalien = await pruefePreisanomalien(aktuelleArtikel, historischeArr);
    if (!anomalien.hat_anomalie || anomalien.warnungen.length === 0) return;

    await supabase.from("kommentare").insert({
      bestellung_id: bestellungId,
      autor_kuerzel: "SYSTEM",
      autor_name: "KI-Preisanomalie",
      text: `Preisanomalien erkannt: ${anomalien.warnungen.map((w) =>
        `${w.artikel}: ${w.aktueller_preis.toFixed(2)}€ vs. Ø ${w.historischer_durchschnitt.toFixed(2)}€ (${w.abweichung_prozent > 0 ? "+" : ""}${w.abweichung_prozent.toFixed(1)}%, ${w.bewertung})`,
      ).join("; ")}`,
    });
    logInfo("webhook/email/preisanomalie", "erkannt", { bestellungId, count: anomalien.warnungen.length });
  } catch (e) {
    logError("webhook/email/preisanomalie", "fehlgeschlagen", e);
  }
}
