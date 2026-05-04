/**
 * R5c — Email-Pipeline Orchestrator
 *
 * Top-Level-Funktion `runEmailPipeline(input)`. Wird aufgerufen von:
 * - `src/app/api/webhook/email/route.ts` (für Make.com / direkten HTTP-Aufruf)
 * - `src/lib/email-pipeline/ingest.ts` (für pg_cron-Pipeline, direct-call)
 *
 * Vorher: 2083 LOC Monolith in route.ts.
 * Nachher: route.ts ist thin auth/rate-limit-Wrapper, run.ts ruft die
 * Pipeline-Module aus `pipeline/` auf.
 *
 * Cost-Tracking: Die ganze Pipeline läuft via `withCostTracking` — der
 * AsyncLocalStorage-Bucket fängt OpenAI-Calls aus `analysiereDokument`,
 * `fuehreAbgleichDurch`, `pruefePreisanomalien`, `erkenneHaendlerAusEmail`,
 * `erkenneBestellerIntelligent` und `kategorisiereArtikel`.
 */

import { createServiceClient } from "@/lib/supabase";
import {
  analysiereDokument,
  erkenneBestellerIntelligent,
  erkenneHaendlerAusEmail,
  type DokumentAnalyse,
} from "@/lib/openai";
import { tryParseVendor, mergeVendorIntoKi } from "@/lib/email-pipeline/vendor-parsers";
import { safeBestellnummer } from "@/lib/validation";
import { updateBestellungStatus, aggregatePipelineConfidence } from "@/lib/bestellung-utils";
import { buildTrackingUrl } from "@/lib/tracking-urls";
import { logError, logInfo } from "@/lib/logger";

import {
  extractEmailAddress,
  extractDomain,
  isIrrelevantDomain,
  isVersandDomain,
  isVersandBetreff,
  isBestellBetreff,
  stripHtml,
  safeBase64ToBuffer,
} from "./pipeline/mail-utils";
import { checkAndClaimIdempotency } from "./pipeline/idempotency-check";
import { normalizeAnhaenge } from "./pipeline/anhang-handling";
import { analysiereAnhaenge, type AnalyseErgebnis } from "./pipeline/anhang-analyse";
import {
  findByExactNumber,
  findByFuzzyNumber,
  findByCrossMatch,
  findByBetragMatch,
  findByErweiterterMatch,
  type MatchContext,
  type BestellungRow,
} from "./pipeline/bestellung-match";
import { handleVersandEmail } from "./pipeline/versand-handler";
import { tryAbgleich } from "./pipeline/abgleich";
import { tryPreisanomalieCheck } from "./pipeline/preisanomalie";
import { handleAboLogik } from "./pipeline/abo-handling";

// =====================================================================
// INTERNAL TYPES (F3.F10: typed statt any)
// =====================================================================

interface HaendlerRow {
  id: string | null;
  name: string | null;
  domain?: string | null;
  email_absender?: string[] | null;
  url_muster?: string[] | null;
  [key: string]: unknown;
}

interface SignalRow {
  id: string;
  kuerzel: string;
  haendler_domain?: string | null;
  order_nummer?: string | null;
  zeitstempel?: string | null;
  status?: string | null;
  matched_bestellung_id?: string | null;
  [key: string]: unknown;
}

// =====================================================================
// PUBLIC API
// =====================================================================

export interface EmailPipelineInput {
  email_betreff: string;
  email_absender: string;
  email_datum: string;
  email_text?: string;
  email_body?: string;
  anhaenge?: unknown;
  hasAttachments?: boolean;
  // Vorfilter (von email-check / R5a)
  vorfilter?: string;
  haendler_id?: string | null;
  haendler_name?: string | null;
  su_id?: string | null;
  bestellnummer_betreff?: string | null;
  document_hint?: string | null;
}

export interface EmailPipelineResult {
  success: true;
  bestellung_id?: string;
  zuordnung?: { methode: string; kuerzel: string };
  dokumente_gespeichert?: number;
  dauer_ms?: number;
  parser_source?: "vendor" | "ki";
  parser_name?: string | null;
  /** Dominanter erkannter Dokumenttyp für email_processing_log.ki_classified_as. */
  dokument_typ?: string;
  /** End-to-End Pipeline-Confidence (Methode + KI aggregiert) für ki_confidence. */
  ki_confidence?: number;
  skipped?: boolean;
  reason?: string;
  deduplicated?: boolean;
  debug_anhaenge?: { raw_empfangen: number; nach_filter: number; analysiert: number };
  versand?: { tracking_nummer: string | null; versanddienstleister: string | null; tracking_url: string | null };
}

const PRIMAER_TYPEN = ["bestellbestaetigung", "rechnung", "aufmass", "leistungsnachweis"];
const BEKANNTE_TYPEN = ["bestellbestaetigung", "lieferschein", "rechnung", "aufmass", "leistungsnachweis", "versandbestaetigung"];
const FLAG_MAP: Record<string, string> = {
  bestellbestaetigung: "hat_bestellbestaetigung",
  lieferschein: "hat_lieferschein",
  rechnung: "hat_rechnung",
  aufmass: "hat_aufmass",
  leistungsnachweis: "hat_leistungsnachweis",
  versandbestaetigung: "hat_versandbestaetigung",
};

export async function runEmailPipeline(input: EmailPipelineInput): Promise<EmailPipelineResult> {
  const startTime = Date.now();
  const { email_betreff, email_absender, email_datum } = input;

  // 1. Vorfilter (von email-check / R5a)
  const vorfilter = input.vorfilter || "";
  const vorfilterHaendlerId = input.haendler_id || null;
  const vorfilterHaendlerName = input.haendler_name || null;
  const vorfilterSuId = input.su_id || null;
  const vorfilterBestellnummer = input.bestellnummer_betreff || null;
  const documentHint =
    typeof input.document_hint === "string" && input.document_hint.length > 0
      ? input.document_hint
      : null;
  const hatVorfilter = vorfilter === "ja";
  let parserSource: "vendor" | "ki" = "ki";
  let parserName: string | null = null;

  if (vorfilter === "nein") {
    logInfo("webhook/email", "Vorfilter: irrelevant", { email_betreff, email_absender });
    return { success: true, skipped: true, reason: "vorfilter_nein" };
  }

  const absenderAdresse = extractEmailAddress(email_absender);
  const absenderDomain = extractDomain(email_absender);

  const supabase = createServiceClient();

  // 2. Irrelevante Domains + Blacklist (nur ohne Vorfilter)
  if (!hatVorfilter) {
    if (isIrrelevantDomain(absenderDomain)) {
      const { data: bekannterHaendler } = await supabase
        .from("haendler")
        .select("id")
        .contains("email_absender", [absenderAdresse])
        .limit(1);
      const { data: bekannterSU } = await supabase
        .from("subunternehmer")
        .select("id")
        .contains("email_absender", [absenderAdresse])
        .limit(1);

      if ((!bekannterHaendler || bekannterHaendler.length === 0) &&
          (!bekannterSU || bekannterSU.length === 0)) {
        logInfo("webhook/email", `Irrelevante Domain: ${absenderDomain}`, { email_betreff });
        return { success: true, skipped: true, reason: "irrelevant_domain" };
      }
    }

    const { data: blacklist } = await supabase.from("email_blacklist").select("muster, typ");
    if (blacklist && blacklist.length > 0) {
      const istBlockiert = blacklist.some((bl) => {
        const muster = bl.muster.toLowerCase();
        if (bl.typ === "adresse") return absenderAdresse === muster;
        return absenderDomain === muster || absenderDomain.endsWith("." + muster);
      });
      if (istBlockiert) {
        return { success: true, skipped: true, reason: "blacklisted" };
      }
    }
  }

  // 3. Idempotenz
  const idem = await checkAndClaimIdempotency(supabase, {
    email_absender,
    email_betreff,
    email_datum,
    email_body: input.email_text || input.email_body || "",
    anhaenge_count: Array.isArray(input.anhaenge) ? input.anhaenge.length : 0,
  });
  if (idem.isDuplicate) {
    return { success: true, deduplicated: true };
  }

  // 4. Betreff-Validierung
  if (email_betreff && email_betreff.length > 500) {
    throw new Error("Betreff zu lang");
  }

  // F3.F15 Fix: Inline-Cleanup entfernt. Hot-Path-Webhook macht keine
  // heimlichen Side-Effects mehr — pg_cron `cleanup-stale-pending`,
  // `cleanup-pgnet-responses`, `cleanup-bestellung-signale` und
  // `cleanup-webhook-logs` (R4) übernehmen diese Cleanups deterministisch.
  // Versand-Only-Cleanup läuft via /api/cron/cleanup (Make-getriggert oder
  // pg_cron, atomar via delete_versand_only_bestellungen).

  // 6. Anhänge normalisieren
  const anhaenge = normalizeAnhaenge(input.anhaenge, email_betreff, email_absender);

  // 7. Email-Body
  const rawEmailText = input.email_text || input.email_body || "";
  const emailText = stripHtml(rawEmailText);

  // 8. Versand-Email-Weiche
  const istVersandDomain = isVersandDomain(absenderDomain);
  const istVersandSubject = isVersandBetreff(email_betreff || "");
  const istBestellSubject = isBestellBetreff(email_betreff || "");
  if (istVersandDomain || (istVersandSubject && !istBestellSubject)) {
    logInfo("webhook/email", `Versand-Email erkannt via ${istVersandDomain ? "Domain" : "Betreff"}`, {
      email_betreff, absenderDomain,
    });
    return await handleVersandEmail(supabase, {
      email_betreff,
      email_absender,
      email_datum,
      emailText,
      anhaenge,
      absenderDomain,
      startTime,
    });
  }

  // 9. Händler/SU erkennen (F3.F10: typed statt any)
  let haendler: HaendlerRow | null = null;
  let erkannterSubunternehmer: { id: string; firma: string } | null = null;
  let bestellungsart: "material" | "subunternehmer" | "abo" = "material";

  if (vorfilterHaendlerId) {
    const { data: vfHaendler } = await supabase
      .from("haendler").select("*").eq("id", vorfilterHaendlerId).maybeSingle();
    if (vfHaendler) {
      haendler = vfHaendler as HaendlerRow;
      const bestehendeAdressen: string[] = vfHaendler.email_absender || [];
      if (absenderAdresse && !bestehendeAdressen.some((a: string) => a.toLowerCase() === absenderAdresse) && bestehendeAdressen.length < 10) {
        await supabase.from("haendler")
          .update({ email_absender: [...bestehendeAdressen, absenderAdresse] })
          .eq("id", vfHaendler.id);
      }
    }
  } else if (vorfilterSuId) {
    const { data: vfSU } = await supabase
      .from("subunternehmer").select("id, firma").eq("id", vorfilterSuId).maybeSingle();
    if (vfSU) {
      erkannterSubunternehmer = { id: vfSU.id, firma: vfSU.firma };
      bestellungsart = "subunternehmer";
    }
  }

  if (!haendler && !erkannterSubunternehmer) {
    // F3.F13: Limit als Safety-Net (heute 74 Händler, bei >2000 muss Architektur überdacht werden)
    const { data: haendlerListe } = await supabase.from("haendler").select("*").limit(2000);

    haendler = haendlerListe?.find((h) =>
      h.email_absender?.some((addr: string) => {
        const normalized = addr.toLowerCase().trim();
        if (normalized.startsWith("*@")) return absenderAdresse.endsWith("@" + normalized.slice(2));
        return absenderAdresse === normalized;
      }),
    ) || null;

    if (!haendler && absenderDomain) {
      haendler = haendlerListe?.find((h) => {
        const hDomain = h.domain?.toLowerCase();
        if (!hDomain) return false;
        return absenderDomain === hDomain || absenderDomain.endsWith("." + hDomain);
      }) || null;

      if (haendler && absenderAdresse) {
        const bestehendeAdressen: string[] = haendler.email_absender || [];
        if (!bestehendeAdressen.some((a) => a.toLowerCase() === absenderAdresse) && bestehendeAdressen.length < 10) {
          await supabase.from("haendler")
            .update({ email_absender: [...bestehendeAdressen, absenderAdresse] })
            .eq("id", haendler.id);
        }
      }
    }

    if (!haendler) {
      // F3.F13: Limit als Safety-Net
      const { data: suListe } = await supabase.from("subunternehmer").select("*").limit(2000);
      if (suListe && suListe.length > 0) {
        const suMatch = suListe.find((su) =>
          su.email_absender?.some((addr: string) => {
            const normalized = addr.toLowerCase().trim();
            if (normalized.startsWith("*@")) return absenderAdresse.endsWith("@" + normalized.slice(2));
            return absenderAdresse === normalized;
          }),
        );
        if (suMatch) {
          erkannterSubunternehmer = { id: suMatch.id, firma: suMatch.firma };
          bestellungsart = "subunternehmer";
        } else if (absenderDomain) {
          const suDomainMatch = suListe.find((su) => {
            const suDomainField = su.domain?.toLowerCase?.();
            if (suDomainField && (absenderDomain === suDomainField || absenderDomain.endsWith("." + suDomainField))) return true;
            const suEmailDomain = su.email?.split("@")[1]?.toLowerCase();
            if (suEmailDomain === absenderDomain) return true;
            return su.email_absender?.some((addr: string) => {
              const normalized = addr.toLowerCase().trim();
              if (normalized.startsWith("*@")) return absenderDomain === normalized.slice(2) || absenderDomain.endsWith("." + normalized.slice(2));
              return addr.split("@")[1]?.toLowerCase() === absenderDomain;
            });
          });
          if (suDomainMatch) {
            erkannterSubunternehmer = { id: suDomainMatch.id, firma: suDomainMatch.firma };
            bestellungsart = "subunternehmer";
          }
        }
      }
    }
  }

  // Plancraft-Spezialbehandlung
  if (!haendler && !erkannterSubunternehmer &&
      (absenderDomain === "plancraft.com" || absenderDomain === "mail.plancraft.com")) {
    bestellungsart = "subunternehmer";
  }

  // Abo-Anbieter
  if (bestellungsart === "material") {
    // F3.F13: Limit als Safety-Net (kleine Tabelle, aber bounded)
    const { data: aboListe } = await supabase.from("abo_anbieter").select("*").limit(500);
    if (aboListe && aboListe.length > 0) {
      const aboMatch = aboListe.find((ab) => {
        if (ab.email_absender?.some((addr: string) => addr.toLowerCase().trim() === absenderAdresse)) return true;
        if (ab.domain && (absenderDomain === ab.domain.toLowerCase() || absenderDomain.endsWith("." + ab.domain.toLowerCase()))) return true;
        return false;
      });
      if (aboMatch) {
        bestellungsart = "abo";
        if (!haendler) haendler = { id: null, name: aboMatch.name, domain: aboMatch.domain };
        logInfo("webhook/email", `Abo-Anbieter erkannt: ${aboMatch.name}`, { absenderDomain, absenderAdresse });
      }
    }
  }

  const haendlerDomain: string = haendler?.domain || absenderDomain;
  let haendlerName: string = haendler?.name || vorfilterHaendlerName || absenderDomain;
  const istAmazon = absenderDomain === "amazon.de" || absenderDomain === "amazon.com" ||
                    absenderDomain.endsWith(".amazon.de") || absenderDomain.endsWith(".amazon.com");
  if (istAmazon) haendlerName = "Amazon Business";

  // 10. Anhänge OpenAI-analysieren
  const analyseErgebnisse = await analysiereAnhaenge(anhaenge, { folderHint: documentHint, startTime });

  // 11. Besteller zuordnen
  const { bestellerKuerzel, zuordnungsMethode, signal: bestellerSignal } =
    await assignBesteller(supabase, {
      haendlerDomain,
      haendlerName,
      absenderDomain,
      vorfilterBestellnummer,
      analyseErgebnisse,
      emailText,
      email_betreff,
      email_datum,
    });
  let bestellerKuerzelMutable = bestellerKuerzel;
  let zuordnungsMethodeMutable = zuordnungsMethode;
  let signal = bestellerSignal;

  // Besteller-Name laden
  let { data: benutzer } = await supabase
    .from("benutzer_rollen").select("name").eq("kuerzel", bestellerKuerzelMutable).maybeSingle();

  // 12. Bestellung finden oder erstellen
  const erkannteBestellnummer = safeBestellnummer(analyseErgebnisse.find((e) => e.analyse.bestellnummer)?.analyse.bestellnummer);
  const erkannteAuftragsnummer = safeBestellnummer(analyseErgebnisse.find((e) => e.analyse.auftragsnummer)?.analyse.auftragsnummer);
  const erkannteLieferscheinnummer = safeBestellnummer(analyseErgebnisse.find((e) => e.analyse.lieferscheinnummer)?.analyse.lieferscheinnummer);
  const suchNummern = [erkannteBestellnummer, erkannteAuftragsnummer, erkannteLieferscheinnummer].filter((n): n is string => !!n);

  // GPT-Bestellnummer-Nachlauf für Besteller-Match
  if (erkannteBestellnummer && !signal && bestellerKuerzelMutable === "UNBEKANNT") {
    const { data: signalByGpt } = await supabase
      .from("bestellung_signale").select("*").eq("order_nummer", erkannteBestellnummer).eq("status", "pending").limit(1);
    if (signalByGpt?.[0]) {
      const { data: claimed } = await supabase
        .from("bestellung_signale")
        .update({ status: "matched", verarbeitet: true })
        .eq("id", signalByGpt[0].id).eq("status", "pending").select("id");
      if (claimed && claimed.length > 0) {
        signal = signalByGpt[0];
        bestellerKuerzelMutable = String(signal!.kuerzel);
        zuordnungsMethodeMutable = "bestellnummer_match_gpt";
        const { data: nachlaufBenutzer } = await supabase
          .from("benutzer_rollen").select("name").eq("kuerzel", bestellerKuerzelMutable).maybeSingle();
        if (nachlaufBenutzer) benutzer = nachlaufBenutzer;
      }
    }
  }
  if (signal && erkannteBestellnummer && !signal.order_nummer) {
    await supabase.from("bestellung_signale")
      .update({ order_nummer: erkannteBestellnummer })
      .eq("id", signal.id);
  }

  const matchCtx: MatchContext = {
    haendler: haendler ? { id: haendler.id, name: haendler.name } : null,
    subunternehmer: erkannterSubunternehmer,
    haendlerName,
  };

  let existierendeBestellung: BestellungRow | null = await findByExactNumber(supabase, suchNummern, matchCtx);

  // R5c-Bugfix: Fuzzy-Match (Substring + Token)
  if (!existierendeBestellung) {
    existierendeBestellung = await findByFuzzyNumber(supabase, suchNummern, matchCtx);
  }

  // Duplikat-Typ-Check (gleicher Dokumenttyp existiert schon)
  if (existierendeBestellung) {
    const hauptTyp = analyseErgebnisse
      .filter((e) => BEKANNTE_TYPEN.includes(e.analyse.typ))
      .map((e) => e.analyse.typ)[0];
    const flagKey = hauptTyp ? FLAG_MAP[hauptTyp] : null;
    if (flagKey && existierendeBestellung[flagKey as keyof BestellungRow]) {
      logInfo("webhook/email", `Duplikat verworfen: Bestellung hat bereits ${hauptTyp}`, {
        bestellungId: existierendeBestellung.id, bestellnummer: erkannteBestellnummer, typ: hauptTyp,
      });
      return {
        success: true,
        skipped: true,
        reason: "duplikat_typ_existiert",
        bestellung_id: existierendeBestellung.id,
      };
    }
  }

  // Cross-Match (ohne Händler-Filter)
  if (!existierendeBestellung && suchNummern.length > 0) {
    existierendeBestellung = await findByCrossMatch(supabase, suchNummern);
  }

  let bestellungId: string;
  let bestellungNeuErstellt = false;

  if (existierendeBestellung) {
    bestellungId = existierendeBestellung.id;
  } else {
    // Betrag-Match (gleicher Händler + Betrag, andere Nummer)
    const erkannterBetrag24h = analyseErgebnisse.find((e) => e.analyse.gesamtbetrag)?.analyse.gesamtbetrag || null;
    const hauptTyp24h = analyseErgebnisse
      .filter((e) => ["bestellbestaetigung", "lieferschein", "rechnung", "aufmass", "leistungsnachweis"].includes(e.analyse.typ))
      .map((e) => e.analyse.typ)[0];

    if (erkannterBetrag24h && hauptTyp24h && haendlerName) {
      const betragMatch = await findByBetragMatch(supabase, {
        betrag: erkannterBetrag24h,
        hauptTyp: hauptTyp24h,
        ctx: matchCtx,
      });
      if (betragMatch) {
        // Nummern ergänzen
        const nummernUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (erkannteBestellnummer && !betragMatch.bestehendeBestellnummer) nummernUpdate.bestellnummer = erkannteBestellnummer;
        if (erkannteAuftragsnummer && !betragMatch.bestehendeAuftragsnummer) nummernUpdate.auftragsnummer = erkannteAuftragsnummer;
        if (Object.keys(nummernUpdate).length > 1) {
          await supabase.from("bestellungen").update(nummernUpdate).eq("id", betragMatch.bestellungId);
        }
        logInfo("webhook/email", `Betrag-Match: gleicher Händler + Betrag → Duplikat verworfen`, {
          bestellungId: betragMatch.bestellungId,
          betrag: erkannterBetrag24h,
          haendler: haendlerName,
          alteNr: betragMatch.alteNr,
          neueNr: erkannteBestellnummer,
        });
        return {
          success: true,
          skipped: true,
          reason: "betrag_match_24h",
          bestellung_id: betragMatch.bestellungId,
        };
      }
    }

    // Erweiterter Match (Händler + offen + Typ-noch-nicht-da)
    const analyseTypen = analyseErgebnisse
      .filter((e) => BEKANNTE_TYPEN.includes(e.analyse.typ))
      .map((e) => e.analyse.typ);

    let erweiterterMatch: string | null = null;
    if (analyseTypen.length > 0) {
      const dokumentNummern = [erkannteBestellnummer, erkannteAuftragsnummer].filter((n): n is string => !!n);
      const erkannterBetrag = analyseErgebnisse.find((e) => e.analyse.gesamtbetrag)?.analyse.gesamtbetrag || null;
      const result = await findByErweiterterMatch(supabase, {
        analyseTypen,
        dokumentNummern,
        erkannterBetrag,
        ctx: matchCtx,
        bestellerKuerzel: bestellerKuerzelMutable,
      });
      if (result) erweiterterMatch = result.bestellungId;
    }

    if (erweiterterMatch) {
      bestellungId = erweiterterMatch;
    } else {
      // Neue Bestellung anlegen
      if (bestellungsart === "material" && analyseErgebnisse.length > 0) {
        const vermuteteArt = analyseErgebnisse.find((e) => e.analyse.vermutete_bestellungsart)?.analyse.vermutete_bestellungsart;
        if (vermuteteArt === "subunternehmer") bestellungsart = "subunternehmer";
      }

      if (haendlerName === absenderDomain && analyseErgebnisse.length > 0) {
        const gptHaendler = analyseErgebnisse.find((e) => e.analyse.haendler)?.analyse.haendler;
        if (gptHaendler) {
          logInfo("webhook/email", `Händlername aus GPT übernommen (statt Domain ${absenderDomain})`, { gptHaendler });
          haendlerName = gptHaendler;
        }
      }

      const { data: neue, error: insertError } = await supabase
        .from("bestellungen")
        .insert({
          bestellnummer: erkannteBestellnummer,
          haendler_id: haendler?.id || null,
          haendler_name: erkannterSubunternehmer?.firma || haendlerName,
          besteller_kuerzel: bestellerKuerzelMutable,
          besteller_name: benutzer?.name || bestellerKuerzelMutable,
          status: "offen",
          zuordnung_methode: zuordnungsMethodeMutable,
          bestellungsart,
          subunternehmer_id: erkannterSubunternehmer?.id || null,
        })
        .select()
        .single();

      if (insertError && erkannteBestellnummer) {
        const { data: fallback } = await supabase
          .from("bestellungen")
          .select("id")
          .eq("bestellnummer", erkannteBestellnummer)
          .limit(1)
          .maybeSingle();
        if (fallback) {
          bestellungId = fallback.id;
        } else {
          throw new Error("Bestellung konnte weder angelegt noch gefunden werden");
        }
      } else if (!neue) {
        throw new Error("Bestellung konnte nicht angelegt werden");
      } else {
        bestellungId = neue.id;
        bestellungNeuErstellt = true;
      }
    }
  }

  if (!bestellungId) {
    throw new Error("Keine bestellungId gesetzt — weder gefunden noch erstellt");
  }

  // 13. Dokumente speichern
  let dokumenteGespeichert = 0;
  const gespeicherteTypen: string[] = [];

  // Supabase Storage akzeptiert nur ASCII-safe Pfade. Deutsche Filenames mit
  // Umlauten/Sonderzeichen (Brillux, Süd-Metall, Raab-Karcher) führen zu
  // "Invalid key" — wir normalisieren den Filename vor dem Upload.
  function sanitizeStorageFilename(name: string): string {
    return name
      .replace(/[äÄ]/g, "ae")
      .replace(/[öÖ]/g, "oe")
      .replace(/[üÜ]/g, "ue")
      .replace(/[ßẞ]/g, "ss")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 120);
  }

  // Fallback wenn KI-Vision den Doku-Typ nicht erkennt: aus Mail-Betreff ableiten.
  // Bei deutschen Geschäftsmails ist der Subject sehr aussagekräftig.
  type DokuTyp = AnalyseErgebnis["analyse"]["typ"];
  function inferTypFromSubject(subject: string | null | undefined): DokuTyp | null {
    if (!subject) return null;
    const s = subject.toLowerCase();
    if (/\b(rechnung|invoice|rechnr|rg-?nr)\b/.test(s)) return "rechnung";
    if (/\b(lieferschein|delivery)\b/.test(s)) return "lieferschein";
    if (/\b(bestellbest[äa]tigung|auftragsbest[äa]tigung|order confirmation|bestellbestaetigung)\b/.test(s)) return "bestellbestaetigung";
    if (/\b(versand(best[äa]tigung)?|tracking|shipping)\b/.test(s)) return "versandbestaetigung";
    if (/\b(aufma(?:ss|ß))\b/.test(s)) return "aufmass";
    if (/\b(leistungsnachweis)\b/.test(s)) return "leistungsnachweis";
    return null;
  }

  for (const ergebnis of analyseErgebnisse) {
    const { analyse, dateiName, base64, mime_type } = ergebnis;

    // F5.X Fix: Vision-Fallback. Wenn KI den Typ nicht erkennt (parse_fehler ODER
    // typ="unbekannt"), versuchen wir den Typ aus dem Mail-Betreff abzuleiten —
    // bei deutschen Geschäftsmails ist der Subject extrem aussagekräftig
    // ("Brillux Rechnung Nr. 6887860"). Das PDF wird dann TROTZDEM in Storage
    // hochgeladen statt silent verworfen.
    const typIstUnbekannt = !BEKANNTE_TYPEN.includes(analyse.typ);
    if (typIstUnbekannt || analyse.parse_fehler) {
      const subjectTyp = inferTypFromSubject(email_betreff);
      if (subjectTyp && BEKANNTE_TYPEN.includes(subjectTyp)) {
        // Subject-Fallback greift: Typ überschreiben, weiter mit Storage-Upload.
        logInfo("webhook/email", `Vision-Fallback: typ="${analyse.typ}" → "${subjectTyp}" (aus Betreff abgeleitet)`, {
          datei: dateiName,
          parse_fehler: !!analyse.parse_fehler,
        });
        analyse.typ = subjectTyp;
        // Ab hier läuft der normale Storage+Insert-Pfad weiter.
      } else {
        // Subject gibt auch nichts her — als unklassifizierbar verwerfen.
        if (analyse.parse_fehler) {
          logError("webhook/email", `OpenAI parse_fehler — Dokument wird übersprungen`, {
            datei: dateiName,
            typ: analyse.typ,
          });
        } else {
          logInfo("webhook/email", `Anhang übersprungen: typ="${analyse.typ}", datei="${dateiName}"`);
        }
        await supabase.from("webhook_logs").insert({
          typ: "email",
          status: "error",
          bestellung_id: bestellungId,
          fehler_text: `Anhang übersprungen: typ="${analyse.typ}", datei="${dateiName}", parse_fehler=${!!analyse.parse_fehler}, subject="${(email_betreff ?? "").slice(0, 80)}"`,
        });
        continue;
      }
    }

    const storagePfad = `${bestellungId}/${analyse.typ}_${Date.now()}_${sanitizeStorageFilename(dateiName)}`;
    const buffer = safeBase64ToBuffer(base64);
    if (!buffer) {
      logError("webhook/email", `Ungültiger base64-Inhalt: ${dateiName}`, { base64_len: base64?.length ?? 0 });
      await supabase.from("webhook_logs").insert({
        typ: "email",
        status: "error",
        bestellung_id: bestellungId,
        fehler_text: `Anhang base64 ungültig: datei="${dateiName}", len=${base64?.length ?? 0}`,
      });
      continue;
    }
    const { error: uploadError } = await supabase.storage
      .from("dokumente")
      .upload(storagePfad, buffer, { contentType: mime_type, upsert: true });

    if (uploadError) {
      logError("webhook/email", `Storage Upload fehlgeschlagen: ${storagePfad}`, uploadError);
      // Echter Storage-Fehler in webhook_logs persistieren — sonst nur in Vercel-Logs
      await supabase.from("webhook_logs").insert({
        typ: "email",
        status: "error",
        bestellung_id: bestellungId,
        fehler_text: `Storage-Upload fehlgeschlagen: pfad="${storagePfad}", mime="${mime_type}", buffer_bytes=${buffer.length}, fehler="${uploadError.message ?? String(uploadError)}"`,
      });
      continue;
    }

    const { error: insertError } = await supabase.from("dokumente").insert({
      bestellung_id: bestellungId,
      typ: analyse.typ,
      quelle: "email",
      storage_pfad: storagePfad,
      email_betreff,
      email_absender,
      email_datum,
      ki_roh_daten: analyse,
      bestellnummer_erkannt: analyse.bestellnummer,
      auftragsnummer: analyse.auftragsnummer || null,
      lieferscheinnummer: analyse.lieferscheinnummer || null,
      artikel: analyse.artikel,
      gesamtbetrag: analyse.gesamtbetrag,
      netto: analyse.netto,
      mwst: analyse.mwst,
      faelligkeitsdatum: analyse.faelligkeitsdatum,
      lieferdatum: analyse.lieferdatum,
      iban: analyse.iban,
      kundennummer: analyse.kundennummer || null,
      besteller_im_dokument: analyse.besteller_im_dokument || null,
      projekt_referenz: analyse.projekt_referenz || null,
      bestelldatum: analyse.bestelldatum || null,
    });
    if (insertError) {
      logError("webhook/email", "Dokument-Insert fehlgeschlagen", insertError);
      await supabase.from("webhook_logs").insert({
        typ: "email",
        status: "error",
        bestellung_id: bestellungId,
        fehler_text: `Dokument-Insert fehlgeschlagen: pfad="${storagePfad}", fehler="${insertError.message}"`,
      });
      continue;
    }

    await applyAnalyseToBestellung(supabase, bestellungId, analyse);
    gespeicherteTypen.push(analyse.typ);
    dokumenteGespeichert++;
  }

  // 14. Rollback: Sekundäre Dokumente ohne Bestellung
  if (bestellungNeuErstellt && dokumenteGespeichert > 0) {
    const hatPrimaerDokument = gespeicherteTypen.some((t) => PRIMAER_TYPEN.includes(t));
    if (!hatPrimaerDokument) {
      logInfo("webhook/email", "Rollback: Nur sekundäre Dokumente (LS/VS) ohne bestehende Bestellung", {
        bestellungId, typen: gespeicherteTypen, email_absender, email_betreff,
      });
      await supabase.from("dokumente").delete().eq("bestellung_id", bestellungId);
      await supabase.from("bestellungen").delete().eq("id", bestellungId);
      return {
        success: true,
        skipped: true,
        reason: "sekundaer_ohne_bestellung",
      };
    }
  }

  // 15. Body-Analyse (Vendor-Parser oder KI)
  if (emailText && emailText.length > 100 && Date.now() - startTime < 45_000) {
    try {
      const vendorResult = await tryParseVendor({
        email_absender: email_absender || "",
        email_betreff: email_betreff || "",
        email_text: emailText,
        anhaenge: [],
      });

      let bodyAnalyse: DokumentAnalyse;

      if (vendorResult && vendorResult.acceptWithoutKI && vendorResult.result.documents.length > 0) {
        bodyAnalyse = vendorResult.result.documents[0];
        parserSource = "vendor";
        parserName = vendorResult.result.vendor;
        logInfo("webhook/email", "Vendor-Parser-Treffer (KI übersprungen)", {
          vendor: parserName,
          parser_version: vendorResult.result.parser_version,
          konfidenz: vendorResult.result.konfidenz,
          bestellnummer: bodyAnalyse.bestellnummer,
          typ: bodyAnalyse.typ,
        });
      } else {
        const bodyMitBetreff = email_betreff
          ? `E-Mail Betreff: ${email_betreff}\nAbsender: ${email_absender || ""}\n\n${emailText.slice(0, 15000)}`
          : emailText.slice(0, 15000);
        const bodyBase64 = Buffer.from(bodyMitBetreff).toString("base64");
        bodyAnalyse = await analysiereDokument(bodyBase64, "text/plain", { folderHint: documentHint || undefined });

        // R5b mergeVendorIntoKi
        if (vendorResult && vendorResult.result.documents.length > 0) {
          const vendorDoc = vendorResult.result.documents[0];
          bodyAnalyse = mergeVendorIntoKi(bodyAnalyse, vendorDoc);
          parserName = vendorResult.result.vendor;
        }
      }

      // Betreff-Korrektur
      if (email_betreff) {
        const betreffLower = email_betreff.toLowerCase();
        const betreffIstBestellung = ["ihre bestellung", "bestellbestätigung", "auftragsbestätigung", "order confirmation", "bestellung eingegangen", "bestellung bei"].some((kw) => betreffLower.includes(kw));
        if (betreffIstBestellung && bodyAnalyse.typ === "versandbestaetigung") {
          logInfo("webhook/email", "Betreff-Korrektur: Versand → Bestellung", { email_betreff, gpt_typ: bodyAnalyse.typ });
          bodyAnalyse.typ = "bestellbestaetigung";
        }
      }

      // Body-only Versand-Rollback
      if (bodyAnalyse.typ === "versandbestaetigung" && bestellungNeuErstellt && dokumenteGespeichert === 0) {
        logInfo("webhook/email", "Rollback: Body-only Versandbestätigung", {
          bestellungId, email_absender, email_betreff,
        });
        await supabase.from("dokumente").delete().eq("bestellung_id", bestellungId);
        await supabase.from("bestellungen").delete().eq("id", bestellungId);
        return {
          success: true,
          skipped: true,
          reason: "versand_body_ohne_bestellung",
        };
      }

      if (BEKANNTE_TYPEN.includes(bodyAnalyse.typ) && !gespeicherteTypen.includes(bodyAnalyse.typ)) {
        // Neuer Typ aus Body
        await supabase.from("dokumente").insert({
          bestellung_id: bestellungId,
          typ: bodyAnalyse.typ,
          quelle: "email",
          storage_pfad: null,
          email_betreff,
          email_absender,
          email_datum,
          ki_roh_daten: bodyAnalyse,
          bestellnummer_erkannt: bodyAnalyse.bestellnummer,
          auftragsnummer: bodyAnalyse.auftragsnummer || null,
          lieferscheinnummer: bodyAnalyse.lieferscheinnummer || null,
          artikel: bodyAnalyse.artikel,
          gesamtbetrag: bodyAnalyse.gesamtbetrag,
          netto: bodyAnalyse.netto,
          mwst: bodyAnalyse.mwst,
          faelligkeitsdatum: bodyAnalyse.faelligkeitsdatum,
          lieferdatum: bodyAnalyse.lieferdatum,
          iban: bodyAnalyse.iban,
          kundennummer: bodyAnalyse.kundennummer || null,
          besteller_im_dokument: bodyAnalyse.besteller_im_dokument || null,
          projekt_referenz: bodyAnalyse.projekt_referenz || null,
          bestelldatum: bodyAnalyse.bestelldatum || null,
        });

        const haendlerNameAfter = await applyAnalyseToBestellung(supabase, bestellungId, bodyAnalyse, {
          haendlerName,
          absenderDomain,
        });
        if (haendlerNameAfter) haendlerName = haendlerNameAfter;
        dokumenteGespeichert++;
        gespeicherteTypen.push(bodyAnalyse.typ);
      } else if (BEKANNTE_TYPEN.includes(bodyAnalyse.typ)) {
        // Nur Felder ergänzen
        await ergaenzeFelder(supabase, bestellungId, bodyAnalyse, haendlerName, absenderDomain);
      }
    } catch (bodyErr) {
      logError("webhook/email", "Body-Analyse fehlgeschlagen", bodyErr);
    }
  }

  // 16. Fallback: Kein Dokument gespeichert
  if (dokumenteGespeichert === 0) {
    const fallbackResult = await tryFallbackKeywordTyp(supabase, bestellungId, {
      emailText,
      email_betreff,
      email_absender,
      email_datum,
      anhaenge_count: anhaenge.length,
      bestellungNeuErstellt,
    });
    if (fallbackResult.shortCircuit) return fallbackResult.response!;
    if (fallbackResult.gespeichert) dokumenteGespeichert = 1;
  }

  // 17. Händler-Auto-Erkennung
  if (!haendler && analyseErgebnisse.length > 0 && Date.now() - startTime < 50_000) {
    try {
      const erkannterHaendlerName = analyseErgebnisse.find((e) => e.analyse.haendler)?.analyse.haendler || null;
      const neuerHaendler = await erkenneHaendlerAusEmail(email_absender, email_betreff, erkannterHaendlerName);
      if (neuerHaendler) {
        const { data: existing } = await supabase
          .from("haendler").select("id").eq("domain", neuerHaendler.domain).limit(1);
        if (!existing || existing.length === 0) {
          await supabase.from("haendler").insert({
            name: neuerHaendler.name,
            domain: neuerHaendler.domain,
            email_absender: [neuerHaendler.email_muster],
            url_muster: [],
          });
          await supabase.from("bestellungen")
            .update({ haendler_name: neuerHaendler.name })
            .eq("id", bestellungId);
          logInfo("webhook/email", `Neuer Händler: ${neuerHaendler.name}`, { domain: neuerHaendler.domain });
        }
      }
    } catch (err) {
      logError("webhook/email", "Händler-Erkennung fehlgeschlagen", err);
    }
  }

  // 18. Status aktualisieren
  await updateBestellungStatus(supabase, bestellungId);

  // 19. KI-Abgleich (nur material)
  if (bestellungsart === "material" && dokumenteGespeichert > 0) {
    await tryAbgleich(supabase, bestellungId);
  }

  // 20. Preisanomalie-Check
  await tryPreisanomalieCheck(supabase, bestellungId, haendlerName, analyseErgebnisse);

  // 21. Abo-Logik
  if (bestellungsart === "abo") {
    await handleAboLogik(supabase, bestellungId, haendlerDomain, haendlerName);
  }

  // 22. Signal verknüpfen
  if (signal) {
    await supabase.from("bestellung_signale")
      .update({ matched_bestellung_id: bestellungId })
      .eq("id", signal.id);
  }

  // 23. UNBEKANNT-Hinweis
  if (bestellerKuerzelMutable === "UNBEKANNT") {
    await supabase.from("kommentare").insert({
      bestellung_id: bestellungId,
      autor_kuerzel: "SYSTEM",
      autor_name: "Zuordnungs-Assistent",
      text: `Bestellung konnte keinem Besteller zugeordnet werden.\nHändler: ${haendlerName}\nAbsender: ${email_absender}\nBetreff: ${email_betreff || "–"}\n\nBitte manuell zuordnen.`,
    });
  }

  // 24. Webhook-Log Erfolg
  await supabase.from("webhook_logs").insert({
    typ: "email",
    status: "success",
    bestellung_id: bestellungId,
    bestellnummer: erkannteBestellnummer || null,
  });

  const dauer = Date.now() - startTime;
  // F4.18: End-to-End Confidence aus Methode + ggf. KI-Konfidenz aggregieren
  const kiKonfidenz = analyseErgebnisse.find((e) => e.analyse.konfidenz)?.analyse.konfidenz ?? null;
  const pipelineConfidence = aggregatePipelineConfidence(zuordnungsMethodeMutable, kiKonfidenz);
  logInfo("webhook/email", `Fertig in ${dauer}ms`, {
    bestellungId,
    dokumente: dokumenteGespeichert,
    besteller: bestellerKuerzelMutable,
    methode: zuordnungsMethodeMutable,
    haendler: haendlerName,
    pipeline_confidence: Math.round(pipelineConfidence * 100) / 100,
  });

  // Dominant-Typ aus den Analyse-Ergebnissen (für email_processing_log.ki_classified_as).
  // Bevorzugt einen PRIMAER_TYPEN-Treffer, fällt sonst auf den ersten bekannten Typ zurück.
  const dokumentTyp =
    analyseErgebnisse.find((e) => PRIMAER_TYPEN.includes(e.analyse.typ))?.analyse.typ
    ?? analyseErgebnisse.find((e) => BEKANNTE_TYPEN.includes(e.analyse.typ))?.analyse.typ
    ?? undefined;

  return {
    success: true,
    bestellung_id: bestellungId,
    zuordnung: { methode: zuordnungsMethodeMutable, kuerzel: bestellerKuerzelMutable },
    dokumente_gespeichert: dokumenteGespeichert,
    dauer_ms: dauer,
    parser_source: parserSource,
    parser_name: parserName,
    dokument_typ: dokumentTyp,
    ki_confidence: pipelineConfidence,
    debug_anhaenge: {
      raw_empfangen: Array.isArray(input.anhaenge) ? input.anhaenge.length : 0,
      nach_filter: anhaenge.length,
      analysiert: analyseErgebnisse.length,
    },
  };
}

// =====================================================================
// HELPER: Besteller-Zuordnung
// =====================================================================

async function assignBesteller(
  supabase: ReturnType<typeof createServiceClient>,
  ctx: {
    haendlerDomain: string;
    haendlerName: string;
    absenderDomain: string;
    vorfilterBestellnummer: string | null;
    analyseErgebnisse: AnalyseErgebnis[];
    emailText: string;
    email_betreff: string;
    email_datum: string;
  },
): Promise<{ bestellerKuerzel: string; zuordnungsMethode: string; signal: SignalRow | null }> {
  const { haendlerDomain, haendlerName, absenderDomain, vorfilterBestellnummer, analyseErgebnisse, emailText, email_betreff, email_datum } = ctx;
  let bestellerKuerzel = "";
  let zuordnungsMethode = "";
  let signal: SignalRow | null = null;

  const parsedDate = email_datum ? new Date(email_datum) : new Date();
  const emailZeit = isNaN(parsedDate.getTime()) ? Date.now() : parsedDate.getTime();

  // STUFE 0: Bestellnummer-Match
  const betreffNrMatch =
    (email_betreff || "").match(/(?:bestellnummer|bestellung|order|auftrag|auftrags-?nr)[:\s#]*([A-Z0-9][\w\-]{2,29})/i)
    || (email_betreff || "").match(/(\d{3}-\d{7}-\d{7})/);
  const schnellBestellnummer = vorfilterBestellnummer || betreffNrMatch?.[1] || null;

  if (schnellBestellnummer) {
    const { data: signalByNr } = await supabase
      .from("bestellung_signale").select("*")
      .eq("order_nummer", schnellBestellnummer)
      .eq("status", "pending")
      .order("zeitstempel", { ascending: false })
      .limit(1);

    if (signalByNr?.[0]) {
      const { data: claimed } = await supabase
        .from("bestellung_signale")
        .update({ status: "matched", verarbeitet: true })
        .eq("id", signalByNr[0].id).eq("status", "pending").select("id");
      if (claimed && claimed.length > 0) {
        const claimedSignal = signalByNr[0] as SignalRow;
        signal = claimedSignal;
        bestellerKuerzel = claimedSignal.kuerzel;
        zuordnungsMethode = "bestellnummer_match";
        logInfo("webhook/email", `Besteller per Bestellnummer zugeordnet: ${claimedSignal.kuerzel}`, { bestellnummer: schnellBestellnummer });
      }
    }
  }

  // STUFE 1: Signal ±4h
  if (!bestellerKuerzel) {
    const { data: signale } = await supabase
      .from("bestellung_signale").select("*")
      .eq("haendler_domain", haendlerDomain)
      .eq("status", "pending")
      .gte("zeitstempel", new Date(emailZeit - 4 * 60 * 60 * 1000).toISOString())
      .lte("zeitstempel", new Date(emailZeit + 4 * 60 * 60 * 1000).toISOString())
      .order("confidence", { ascending: false })
      .order("zeitstempel", { ascending: false })
      .limit(1);

    if (signale?.[0]) {
      const { data: claimed } = await supabase
        .from("bestellung_signale")
        .update({ status: "matched", verarbeitet: true })
        .eq("id", signale[0].id).eq("status", "pending").select("id");
      if (claimed && claimed.length > 0) {
        const claimedSignal = signale[0] as SignalRow;
        signal = claimedSignal;
        bestellerKuerzel = claimedSignal.kuerzel;
        zuordnungsMethode = "signal_4h";
      }
    }
  }

  // STUFE 3: Händler-Affinität
  if (!bestellerKuerzel) {
    const { data: affinitaet } = await supabase
      .from("bestellungen").select("besteller_kuerzel")
      .eq("haendler_name", haendlerName)
      .neq("besteller_kuerzel", "UNBEKANNT")
      .order("created_at", { ascending: false })
      .limit(50);

    if (affinitaet && affinitaet.length >= 3) {
      const zaehler = new Map<string, number>();
      for (const b of affinitaet) {
        zaehler.set(b.besteller_kuerzel, (zaehler.get(b.besteller_kuerzel) || 0) + 1);
      }
      const sortiert = [...zaehler.entries()].sort((a, b) => b[1] - a[1]);
      const [topKuerzel, topAnzahl] = sortiert[0];
      if (topAnzahl / affinitaet.length > 0.6) {
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
        const { data: historie } = await supabase
          .from("bestellungen").select("besteller_kuerzel, besteller_name, haendler_name")
          .ilike("haendler_name", haendlerName)
          .neq("besteller_kuerzel", "UNBEKANNT")
          .limit(50);

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

  return { bestellerKuerzel, zuordnungsMethode, signal };
}

// =====================================================================
// HELPER: Analyse → Bestellung Update
// =====================================================================

async function applyAnalyseToBestellung(
  supabase: ReturnType<typeof createServiceClient>,
  bestellungId: string,
  analyse: DokumentAnalyse,
  ctx?: { haendlerName: string; absenderDomain: string },
): Promise<string | null> {
  const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (FLAG_MAP[analyse.typ]) updateFields[FLAG_MAP[analyse.typ]] = true;

  if (analyse.typ === "versandbestaetigung") {
    if (analyse.tracking_nummer) updateFields.tracking_nummer = analyse.tracking_nummer;
    if (analyse.versanddienstleister) updateFields.versanddienstleister = analyse.versanddienstleister;
    if (analyse.tracking_url) {
      updateFields.tracking_url = analyse.tracking_url;
    } else if (analyse.versanddienstleister && analyse.tracking_nummer) {
      const autoUrl = buildTrackingUrl(analyse.versanddienstleister, analyse.tracking_nummer);
      if (autoUrl) updateFields.tracking_url = autoUrl;
    }
    if (analyse.voraussichtliche_lieferung) updateFields.voraussichtliche_lieferung = analyse.voraussichtliche_lieferung;
  } else {
    if (analyse.bestellnummer) updateFields.bestellnummer = analyse.bestellnummer;
    if (analyse.auftragsnummer) updateFields.auftragsnummer = analyse.auftragsnummer;
    if (analyse.lieferscheinnummer) updateFields.lieferscheinnummer = analyse.lieferscheinnummer;
    const effektiverBetrag = analyse.gesamtbetrag != null ? analyse.gesamtbetrag : (analyse.netto ?? null);
    const istNetto = !analyse.gesamtbetrag && !!analyse.netto;
    if (effektiverBetrag && analyse.typ === "rechnung") {
      updateFields.betrag = effektiverBetrag;
      if (istNetto) updateFields.betrag_ist_netto = true;
    } else if (effektiverBetrag) {
      const { data: existing } = await supabase
        .from("bestellungen").select("betrag").eq("id", bestellungId).maybeSingle();
      if (existing && !existing.betrag) {
        updateFields.betrag = effektiverBetrag;
        if (istNetto) updateFields.betrag_ist_netto = true;
      }
    }
  }

  // Händlername aus Body übernehmen wenn fehlend
  let haendlerNameAfter: string | null = null;
  if (ctx && analyse.haendler && (!ctx.haendlerName || ctx.haendlerName === ctx.absenderDomain || ctx.haendlerName === "")) {
    updateFields.haendler_name = analyse.haendler;
    haendlerNameAfter = analyse.haendler;
    logInfo("webhook/email", `Händlername aus Body-Analyse übernommen: ${analyse.haendler}`);
  }

  await supabase.from("bestellungen").update(updateFields).eq("id", bestellungId);
  return haendlerNameAfter;
}

async function ergaenzeFelder(
  supabase: ReturnType<typeof createServiceClient>,
  bestellungId: string,
  bodyAnalyse: DokumentAnalyse,
  haendlerName: string,
  absenderDomain: string,
): Promise<void> {
  const ergaenzung: Record<string, unknown> = {};
  if (bodyAnalyse.bestellnummer && bodyAnalyse.typ !== "versandbestaetigung") {
    const { data: check } = await supabase
      .from("bestellungen").select("bestellnummer").eq("id", bestellungId).maybeSingle();
    if (check && !check.bestellnummer) ergaenzung.bestellnummer = bodyAnalyse.bestellnummer;
  }
  if (bodyAnalyse.typ !== "versandbestaetigung") {
    const ergBetrag = bodyAnalyse.gesamtbetrag != null ? bodyAnalyse.gesamtbetrag : (bodyAnalyse.netto ?? null);
    if (ergBetrag) {
      const { data: check } = await supabase
        .from("bestellungen").select("betrag").eq("id", bestellungId).maybeSingle();
      if (check && !check.betrag) {
        ergaenzung.betrag = ergBetrag;
        if (!bodyAnalyse.gesamtbetrag && !!bodyAnalyse.netto) ergaenzung.betrag_ist_netto = true;
      }
    }
  }
  if (bodyAnalyse.haendler && (!haendlerName || haendlerName === absenderDomain || haendlerName === "")) {
    ergaenzung.haendler_name = bodyAnalyse.haendler;
  }
  if (Object.keys(ergaenzung).length > 0) {
    await supabase.from("bestellungen").update(ergaenzung).eq("id", bestellungId);
  }
}

// =====================================================================
// HELPER: Fallback-Keyword-Typ
// =====================================================================

interface FallbackInput {
  emailText: string;
  email_betreff: string;
  email_absender: string;
  email_datum: string;
  anhaenge_count: number;
  bestellungNeuErstellt: boolean;
}

interface FallbackResult {
  shortCircuit: boolean;
  response?: EmailPipelineResult;
  gespeichert: boolean;
}

async function tryFallbackKeywordTyp(
  supabase: ReturnType<typeof createServiceClient>,
  bestellungId: string,
  input: FallbackInput,
): Promise<FallbackResult> {
  const { emailText, email_betreff, email_absender, email_datum, anhaenge_count, bestellungNeuErstellt } = input;

  if (emailText && emailText.length > 20) {
    const suchText = ((email_betreff || "") + " " + emailText.slice(0, 500)).toLowerCase();
    const bestellungKw = ["bestellbestätigung", "bestellbestaetigung", "auftragsbestätigung", "order confirmation", "ihre bestellung", "bestellung eingegangen", "bestellung bei"];
    const rechnungKw = ["rechnung", "invoice", "zahlungsaufforderung", "fällig", "rechnungsnummer", "zahlungsziel"];
    const lieferscheinKw = ["lieferschein", "lieferung", "delivery note", "warenausgang"];
    const versandKw = ["versandbestätigung", "versandbestaetigung", "versendet", "sendungsverfolgung", "tracking", "shipped", "zustellung", "unterwegs", "paket wurde", "sendung verfolgen"];

    let fallbackTyp: string;
    let fallbackFlag: string;

    if (bestellungKw.some((k) => suchText.includes(k))) {
      fallbackTyp = "bestellbestaetigung";
      fallbackFlag = "hat_bestellbestaetigung";
    } else if (rechnungKw.some((k) => suchText.includes(k))) {
      fallbackTyp = "rechnung";
      fallbackFlag = "hat_rechnung";
    } else if (lieferscheinKw.some((k) => suchText.includes(k))) {
      fallbackTyp = "lieferschein";
      fallbackFlag = "hat_lieferschein";
    } else if (versandKw.some((k) => suchText.includes(k))) {
      fallbackTyp = "versandbestaetigung";
      fallbackFlag = "hat_versandbestaetigung";
    } else {
      if (bestellungNeuErstellt) {
        logInfo("webhook/email", "Rollback: Body-only ohne erkannten Typ", { bestellungId, email_absender, email_betreff });
        await supabase.from("dokumente").delete().eq("bestellung_id", bestellungId);
        await supabase.from("bestellungen").delete().eq("id", bestellungId);
      }
      return {
        shortCircuit: true,
        response: { success: true, skipped: true, reason: "kein_dokument_erkannt" },
        gespeichert: false,
      };
    }

    if ((fallbackTyp === "versandbestaetigung" || fallbackTyp === "lieferschein") && bestellungNeuErstellt) {
      logInfo("webhook/email", `Rollback: ${fallbackTyp} ohne bestehende Bestellung`, { bestellungId, email_absender, email_betreff });
      await supabase.from("dokumente").delete().eq("bestellung_id", bestellungId);
      await supabase.from("bestellungen").delete().eq("id", bestellungId);
      return {
        shortCircuit: true,
        response: { success: true, skipped: true, reason: "sekundaer_ohne_bestellung" },
        gespeichert: false,
      };
    }

    const bestellungUpdate: Record<string, unknown> = {
      [fallbackFlag]: true,
      updated_at: new Date().toISOString(),
    };

    if (fallbackTyp === "versandbestaetigung") {
      const trackingMatch = emailText.match(/(?:sendungsnummer|tracking[- ]?(?:nr|nummer|number|id|code)|paketnummer)[:\s]*([A-Z0-9]{8,30})/i);
      if (trackingMatch) bestellungUpdate.tracking_nummer = trackingMatch[1];

      const carriers = [
        { name: "DHL", pattern: /\bDHL\b/i },
        { name: "DPD", pattern: /\bDPD\b/i },
        { name: "Hermes", pattern: /\bHermes\b/i },
        { name: "UPS", pattern: /\bUPS\b/i },
        { name: "GLS", pattern: /\bGLS\b/i },
      ];
      const carrier = carriers.find((c) => c.pattern.test(emailText));
      if (carrier) bestellungUpdate.versanddienstleister = carrier.name;

      const urlMatch = emailText.match(/https?:\/\/[^\s"'<>]+(?:track|sendung|parcel|verfolg)[^\s"'<>]*/i);
      if (urlMatch) bestellungUpdate.tracking_url = urlMatch[0];
      else if (carrier && trackingMatch) {
        const autoUrl = buildTrackingUrl(carrier.name, trackingMatch[1]);
        if (autoUrl) bestellungUpdate.tracking_url = autoUrl;
      }
    }

    await supabase.from("dokumente").insert({
      bestellung_id: bestellungId,
      typ: fallbackTyp,
      quelle: "email",
      storage_pfad: null,
      email_betreff,
      email_absender,
      email_datum,
      ki_roh_daten: { typ: fallbackTyp, quelle: "email_body", email_text: emailText.slice(0, 5000) },
      bestellnummer_erkannt: null,
      artikel: null,
      gesamtbetrag: null,
      netto: null,
      mwst: null,
      faelligkeitsdatum: null,
      lieferdatum: null,
      iban: null,
    });
    await supabase.from("bestellungen").update(bestellungUpdate).eq("id", bestellungId);
    return { shortCircuit: false, gespeichert: true };
  }

  if (bestellungNeuErstellt) {
    logError("webhook/email", "Rollback: Keine Dokumente", { bestellungId, email_absender, email_betreff });
    await supabase.from("dokumente").delete().eq("bestellung_id", bestellungId);
    await supabase.from("bestellungen").delete().eq("id", bestellungId);
    throw new Error(`Keine Dokumente konnten gespeichert werden (anhaenge=${anhaenge_count}, body_len=${emailText.length})`);
  }

  return { shortCircuit: false, gespeichert: false };
}
