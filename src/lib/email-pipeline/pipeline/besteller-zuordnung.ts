/**
 * Besteller-Zuordnung über mehrere Stufen:
 *
 *   STUFE -1 — Rules-Engine (besteller_rules-Tabelle, Welle 4 O8)
 *   STUFE 3  — Händler-Affinität (50-Bestellungen-Stichprobe ≥60% gleicher Besteller)
 *   STUFE 4  — Name im Text (besteller_im_dokument + Volltext-Match auf benutzer_rollen)
 *   STUFE 4.5 — KI-Historisch (erkenneBestellerIntelligent mit Artikel-Vergleich)
 *   Fallback — "UNBEKANNT" + Methode "unbekannt"
 *
 * 19.05.2026 (A2.1) — aus run.ts extrahiert. Verhalten unverändert.
 * 22.05.2026 — STUFE 0 (Bestellnummer-Signal-Match) + STUFE 1 (Signal ±4h) + GPT-
 * Bestellnummer-Nachlauf entfernt, da Chrome-Extension stillgelegt wurde. Die
 * verbleibenden Stufen reichen, weil die KI-historische Erkennung in der Praxis
 * fast immer trifft sobald 5+ Bestellungen für einen Händler in der DB sind.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  erkenneBestellerIntelligent,
  type DokumentAnalyse,
} from "@/lib/openai";
import { logError, logInfo } from "@/lib/logger";
import type { AnalyseErgebnis } from "./anhang-analyse";

export interface BestellerZuordnungContext {
  haendlerDomain: string;
  haendlerName: string;
  absenderDomain: string;
  vorfilterBestellnummer: string | null;
  analyseErgebnisse: AnalyseErgebnis[];
  emailText: string;
  email_betreff: string;
  email_datum: string;
}

export interface BestellerZuordnungResult {
  bestellerKuerzel: string;
  zuordnungsMethode: string;
}

export async function assignBesteller(
  supabase: SupabaseClient,
  ctx: BestellerZuordnungContext,
): Promise<BestellerZuordnungResult> {
  const { haendlerDomain, haendlerName, absenderDomain, analyseErgebnisse, emailText, email_betreff } = ctx;
  let bestellerKuerzel = "";
  let zuordnungsMethode = "";

  // 06.05.2026 (Welle 4 O8) — STUFE -1: Rules-Engine.
  // Admin-konfigurierbare Regeln aus besteller_rules-Tabelle. Wenn DB-Match
  // → Besteller direkt setzen ohne weitere Stufen zu durchlaufen. Tabelle
  // leer → kein Effekt (silent skip), nachfolgende Stufen greifen wie gewohnt.
  // Plus: Statistik (hit_count + last_hit_at) wird automatisch upd via RPC.
  try {
    const { data: ruleMatch } = await supabase
      .rpc("match_besteller_rules", {
        p_haendler_domain: haendlerDomain,
        p_haendler_id: null,
        p_email_absender: ctx.haendlerName ?? null,  // Absender-Domain via haendlerDomain abgedeckt; pattern matcht haendlerName auch
        p_email_betreff: email_betreff ?? null,
      });
    if (ruleMatch && Array.isArray(ruleMatch) && ruleMatch.length > 0) {
      const match = ruleMatch[0] as { rule_id: string; target_kuerzel: string; confidence: number; rule_name: string };
      bestellerKuerzel = match.target_kuerzel;
      zuordnungsMethode = `rule:${match.rule_name}`;
      logInfo("webhook/email", `Rules-Engine: Besteller via Regel "${match.rule_name}" zugeordnet`, {
        target_kuerzel: match.target_kuerzel,
        confidence: match.confidence,
        rule_id: match.rule_id,
      });
    }
  } catch (e) {
    logError("webhook/email", "match_besteller_rules fehlgeschlagen (fail-open, weiter mit STUFE 3+)", e);
  }

  // STUFE 3: Händler-Affinität
  // 06.05.2026 — Cache: Historie wird in STUFE 4.5 wiederverwendet (gleiche
  // bestellungen-Tabelle + ähnlicher Filter). Prefetch hier in einem
  // gemeinsamen Block. Nur fetchen wenn wirklich nötig (kein bestellerKuerzel).
  let historieCache: Array<{ besteller_kuerzel: string; besteller_name: string | null; haendler_name: string | null }> | null = null;
  if (!bestellerKuerzel) {
    const { data: affinitaet } = await supabase
      .from("bestellungen").select("besteller_kuerzel, besteller_name, haendler_name")
      .ilike("haendler_name", haendlerName)
      .neq("besteller_kuerzel", "UNBEKANNT")
      .order("created_at", { ascending: false })
      .limit(50);

    historieCache = affinitaet || [];

    if (historieCache.length >= 3) {
      const zaehler = new Map<string, number>();
      for (const b of historieCache) {
        zaehler.set(b.besteller_kuerzel, (zaehler.get(b.besteller_kuerzel) || 0) + 1);
      }
      const sortiert = [...zaehler.entries()].sort((a, b) => b[1] - a[1]);
      const [topKuerzel, topAnzahl] = sortiert[0];
      if (topAnzahl / historieCache.length > 0.6) {
        bestellerKuerzel = topKuerzel;
        zuordnungsMethode = "haendler_affinitaet";
      }
    }
  }

  // STUFE 4: Name im Text
  if (!bestellerKuerzel) {
    const { data: benutzerListe } = await supabase
      .from("benutzer_rollen").select("kuerzel, name, email")
      .in("rolle", ["besteller", "admin"]);

    if (benutzerListe) {
      const gptBesteller = analyseErgebnisse.find((e) => e.analyse.besteller_im_dokument)?.analyse.besteller_im_dokument?.toLowerCase() || "";
      if (gptBesteller) {
        for (const benutzer of benutzerListe) {
          const namen: string[] = String(benutzer.name).toLowerCase().split(" ");
          if (namen.length >= 2 && namen.every((n: string) => gptBesteller.includes(n))) {
            bestellerKuerzel = String(benutzer.kuerzel);
            zuordnungsMethode = "besteller_im_dokument";
            break;
          }
        }
      }

      if (!bestellerKuerzel) {
        const suchTexte = [
          emailText,
          email_betreff || "",
          ...analyseErgebnisse.map((e) => e.analyse.volltext || ""),
          ...analyseErgebnisse.map((e) => JSON.stringify(e.analyse.lieferadressen || [])),
        ].join(" ").toLowerCase();

        for (const benutzer of benutzerListe) {
          const namen: string[] = String(benutzer.name).toLowerCase().split(" ");
          if (namen.length >= 2 && namen.every((n: string) => suchTexte.includes(n))) {
            bestellerKuerzel = String(benutzer.kuerzel);
            zuordnungsMethode = "name_im_text";
            break;
          }
        }
      }
    }
  }

  // STUFE 4.5: KI-Historisch
  if (!bestellerKuerzel && haendlerName && haendlerName !== absenderDomain) {
    const gptArtikel = analyseErgebnisse.flatMap((e) => e.analyse.artikel || []).slice(0, 10);
    if (gptArtikel.length > 0) {
      try {
        // 06.05.2026 — historieCache aus STUFE 3 wiederverwenden (gleiche Query)
        const historie = historieCache;

        if (historie && historie.length >= 5) {
          const bestellerIds = [...new Set(historie.map((b) => b.besteller_kuerzel))];
          const bestellerInfo = bestellerIds.map((kuerzel) => {
            const benutzer = historie.find((b) => b.besteller_kuerzel === kuerzel);
            return {
              kuerzel,
              name: benutzer?.besteller_name || kuerzel,
              artikel_namen: [] as string[],
              haendler: [haendlerName],
            };
          });

          type Artikel = NonNullable<DokumentAnalyse["artikel"]>[number];
          const artikelInput = gptArtikel.map((a: Artikel) => ({
            name: a.name,
            menge: typeof a.menge === "number" ? a.menge : 1,
            einzelpreis: typeof a.einzelpreis === "number" ? a.einzelpreis : 0,
          }));

          const ergebnis = await erkenneBestellerIntelligent(artikelInput, haendlerName, bestellerInfo);
          if (ergebnis.kuerzel && ergebnis.kuerzel !== "UNBEKANNT" && ergebnis.konfidenz >= 0.6) {
            bestellerKuerzel = ergebnis.kuerzel;
            zuordnungsMethode = "ki_historisch";
            logInfo("webhook/email", `Besteller via KI-Historie erkannt: ${ergebnis.kuerzel}`, {
              konfidenz: ergebnis.konfidenz, begruendung: ergebnis.begruendung,
            });
          }
        }
      } catch (e) {
        logError("webhook/email", "erkenneBestellerIntelligent fehlgeschlagen", e);
      }
    }
  }

  if (!bestellerKuerzel) {
    bestellerKuerzel = "UNBEKANNT";
    zuordnungsMethode = "unbekannt";
  }

  return { bestellerKuerzel, zuordnungsMethode };
}
