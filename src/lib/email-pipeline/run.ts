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
import { safeBestellnummer } from "@/lib/validation";
import { aggregatePipelineConfidence } from "@/lib/bestellung-utils";
import { logError, logInfo } from "@/lib/logger";

import {
  extractEmailAddress,
  extractDomain,
  isVersandDomain,
  isVersandBetreff,
  isBestellBetreff,
  isStrictVersandBetreff,
  stripHtml,
  htmlToStructuredText,
} from "./pipeline/mail-utils";
import { normalizeAnhaenge } from "./pipeline/anhang-handling";
import { tryParseEInvoiceFromAttachments } from "./pipeline/xrechnung";
import { analysiereAnhaenge } from "./pipeline/anhang-analyse";
import { type MatchContext } from "./pipeline/bestellung-match";
import { handleVersandEmail } from "./pipeline/versand-handler";
import { PRIMAER_TYPEN, BEKANNTE_TYPEN } from "./pipeline/constants";
import { assignBesteller, applyGptBestellnummerNachlauf } from "./pipeline/besteller-zuordnung";
import { tryFallbackKeywordTyp } from "./pipeline/fallback-keyword";
import { extractBodyHints } from "./pipeline/regex-extract";
import { findeOderErstelleBestellung } from "./pipeline/bestellung-finden";
import { persistAnhangDokumente } from "./pipeline/dokument-persist";
import { analysiereBody } from "./pipeline/body-analyse";
import {
  identifyHaendlerSuAbo,
  autoErkenneNeuenHaendler,
  type HaendlerRow,
} from "./pipeline/haendler-erkennen";
import { runPreBestellungsChecks } from "./pipeline/pre-bestellungs-checks";
import {
  sanityCleanupLeereBestellung,
  propagiereBestellnummerAusDoku,
} from "./pipeline/post-bestellungs-cleanup";
import { runPostProcessing } from "./pipeline/post-processing";

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
  /**
   * Re-Backfill-Idempotenz (05.05.2026): Wenn diese Mail bereits einer
   * Bestellung zugeordnet war (email_processing_log.bestellung_id != NULL),
   * wird hier die ID übergeben. Pipeline UPDATEt diese Bestellung dann statt
   * eine neue anzulegen — verhindert Duplikate beim Re-Backfill.
   */
  existing_bestellung_id?: string | null;
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

  // Schritte 2-4 — Filter + Reply-Action + Idempotenz + Betreff-Check.
  // Siehe pipeline/pre-bestellungs-checks.ts.
  const preCheck = await runPreBestellungsChecks(supabase, {
    hatVorfilter,
    existing_bestellung_id: input.existing_bestellung_id,
    absenderAdresse,
    absenderDomain,
    email_absender,
    email_betreff,
    email_datum,
    email_text: input.email_text,
    email_body: input.email_body,
    anhaenge_count: Array.isArray(input.anhaenge) ? input.anhaenge.length : 0,
  });
  if (preCheck) return preCheck;

  // F3.F15 Fix: Inline-Cleanup entfernt. Hot-Path-Webhook macht keine
  // heimlichen Side-Effects mehr — pg_cron `cleanup-stale-pending`,
  // `cleanup-pgnet-responses`, `cleanup-bestellung-signale` und
  // `cleanup-webhook-logs` (R4) übernehmen diese Cleanups deterministisch.

  // 6. Anhänge normalisieren
  const anhaenge = normalizeAnhaenge(input.anhaenge, email_betreff, email_absender);

  // Anhang-Pipeline-Eskalation (05.05.2026): wenn die Mail Anhänge hatte aber
  // nach normalizeAnhaenge nichts übrig ist (alle wegen MIME/Größe/Magic-Bytes
  // gefiltert), eskalieren — damit der Bug nicht still durchschlüpft. Beispiel:
  // Feistbaur 2026-04-23 hatte has_attachments=true aber 0 PDFs im Storage,
  // weil das PDF in einer früheren Pipeline-Version den Filter nicht passierte.
  const rawAnhaengeCount = Array.isArray(input.anhaenge) ? input.anhaenge.length : 0;
  if (input.hasAttachments === true && rawAnhaengeCount === 0) {
    logError("webhook/email", "Anhang-Pipeline-Eskalation: hasAttachments=true aber input.anhaenge ist leer", {
      email_betreff, email_absender, has_attachments: input.hasAttachments,
    });
  } else if (rawAnhaengeCount > 0 && anhaenge.length === 0) {
    logError("webhook/email", "Anhang-Pipeline-Eskalation: alle Anhänge nach Normalisierung gefiltert", {
      email_betreff, email_absender,
      raw_count: rawAnhaengeCount,
      after_filter: anhaenge.length,
    });
  }

  // 7. Email-Body
  // emailText (flat) für Vendor-Parser, Idempotenz-Hash, Subject-Heuristiken.
  // emailTextStrukturiert (HTML→Plain mit Tabellen-Erhalt) speziell für KI-Analyse:
  // bewahrt Spalten/Zeilen-Trennung sodass Brutto/Netto/MwSt-Tabellen korrekt
  // extrahiert werden (Make.com hat das nie gemacht — Beträge gingen oft verloren).
  const rawEmailText = input.email_text || input.email_body || "";
  const emailText = stripHtml(rawEmailText);
  const emailTextStrukturiert = htmlToStructuredText(rawEmailText);

  // 8. Versand-Email-Weiche
  // 06.05.2026: Strict-VB-Override hinzugefügt — Subjects wie "Ihre Bestellung
  // ist unterwegs", "wird heute zugestellt", "voraussichtlicher Liefertermin"
  // sind eindeutig Versand auch wenn "Bestellung"/BB-Keyword im Subject steht.
  // Verhindert die CHECK24/Megabad-Misklassifikation als BB.
  const istVersandDomain = isVersandDomain(absenderDomain);
  const istVersandSubject = isVersandBetreff(email_betreff || "");
  const istStrictVersand = isStrictVersandBetreff(email_betreff || "");
  const istBestellSubject = isBestellBetreff(email_betreff || "");
  if (istVersandDomain || istStrictVersand || (istVersandSubject && !istBestellSubject)) {
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

  // 9. Händler/SU/Abo erkennen — siehe pipeline/haendler-erkennen.ts
  const haendlerInfo = await identifyHaendlerSuAbo(supabase, {
    vorfilterHaendlerId,
    vorfilterHaendlerName,
    vorfilterSuId,
    absenderAdresse,
    absenderDomain,
  });
  let haendler: HaendlerRow | null = haendlerInfo.haendler;
  const erkannterSubunternehmer = haendlerInfo.erkannterSubunternehmer;
  let bestellungsart = haendlerInfo.bestellungsart;
  const haendlerDomain = haendlerInfo.haendlerDomain;
  let haendlerName = haendlerInfo.haendlerName;

  // 9b. XRechnung/ZUGFeRD-Schicht — strukturierte E-Rechnungen ohne KI.
  // Seit 1.1.2025 senden viele Lieferanten XML-Anhänge oder ZUGFeRD-PDFs
  // (PDF mit eingebetteter XML). Diese sind 100% deterministisch parsebar.
  // Wenn eine E-Rechnung gefunden wird, überspringen wir die KI komplett für
  // diese Mail — Halluzinationen und Pattern-Misses ausgeschlossen.
  const eInvoice = await tryParseEInvoiceFromAttachments(anhaenge);

  // 10. Anhänge OpenAI-analysieren — bei E-Rechnung als zweiter Datensatz
  // (für Storage-Upload des PDFs), aber die strukturierten Felder kommen aus XML.
  const analyseErgebnisse = await analysiereAnhaenge(anhaenge, { folderHint: documentHint, startTime });

  // Wenn E-Rechnung erfolgreich geparst: Daten in den ersten passenden
  // analyseErgebnis-Eintrag mergen, damit die Pipeline weiterläuft als wäre
  // KI gelaufen — aber mit verlässlichen XML-Daten statt Halluzinationen.
  if (eInvoice && analyseErgebnisse.length > 0) {
    const target = analyseErgebnisse.find((e) => e.mime_type === "application/pdf") ?? analyseErgebnisse[0];
    target.analyse = {
      ...target.analyse,
      typ: eInvoice.typ,
      bestellnummer: eInvoice.bestellnummer ?? target.analyse.bestellnummer,
      haendler: eInvoice.haendler ?? target.analyse.haendler,
      datum: eInvoice.datum ?? target.analyse.datum,
      gesamtbetrag: eInvoice.gesamtbetrag ?? target.analyse.gesamtbetrag,
      netto: eInvoice.netto ?? target.analyse.netto,
      mwst: eInvoice.mwst ?? target.analyse.mwst,
      faelligkeitsdatum: eInvoice.faelligkeitsdatum ?? target.analyse.faelligkeitsdatum,
      iban: eInvoice.iban ?? target.analyse.iban,
      konfidenz: 1.0,
    };
    logInfo("webhook/email", "E-Rechnung-Daten in Anhang-Analyse gemergt", {
      bestellnummer: eInvoice.bestellnummer,
      gesamtbetrag: eInvoice.gesamtbetrag,
    });
  } else if (eInvoice && analyseErgebnisse.length === 0) {
    // E-Rechnung als XML-only ohne PDF-Anhang — synthetisches Analyse-Ergebnis
    analyseErgebnisse.push({
      analyse: eInvoice,
      dateiName: "xrechnung.xml",
      base64: "",
      mime_type: "application/xml",
    });
  }

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
  let erkannteBestellnummer = safeBestellnummer(analyseErgebnisse.find((e) => e.analyse.bestellnummer)?.analyse.bestellnummer);
  const erkannteAuftragsnummer = safeBestellnummer(analyseErgebnisse.find((e) => e.analyse.auftragsnummer)?.analyse.auftragsnummer);
  const erkannteLieferscheinnummer = safeBestellnummer(analyseErgebnisse.find((e) => e.analyse.lieferscheinnummer)?.analyse.lieferscheinnummer);

  // Regex-Extraction: Subject-Bestellnummer-Patterns + Body-Betrag/Kundennr/
  // Gutschrift-Fallbacks. Deterministische Defense-in-Depth-Schicht parallel
  // zur KI-Analyse. Siehe pipeline/regex-extract.ts.
  const bodyHints = extractBodyHints({
    email_betreff: email_betreff ?? "",
    email_body: input.email_text ?? input.email_body ?? "",
    analyseErgebnisse,
    erkannteBestellnummer,
    erkannteAuftragsnummer,
    erkannteLieferscheinnummer,
  });
  erkannteBestellnummer = bodyHints.erkannteBestellnummer;
  const subjectExtraNummern = bodyHints.subjectExtraNummern;
  const bodyExtractedBetrag = bodyHints.bodyExtractedBetrag;
  const bodyExtractedKundennummer = bodyHints.bodyExtractedKundennummer;
  const bodyExtractedIstGutschrift = bodyHints.bodyExtractedIstGutschrift;

  const suchNummern = [erkannteBestellnummer, erkannteAuftragsnummer, erkannteLieferscheinnummer, ...subjectExtraNummern].filter((n): n is string => !!n);

  // GPT-Bestellnummer-Nachlauf: ggf. pending bestellung_signal anhand der
  // KI-extrahierten BN nachträglich claimen + Backfill von order_nummer.
  const nachlauf = await applyGptBestellnummerNachlauf(supabase, {
    bestellerKuerzel: bestellerKuerzelMutable,
    signal,
    benutzer,
    erkannteBestellnummer,
  });
  bestellerKuerzelMutable = nachlauf.bestellerKuerzel;
  if (nachlauf.zuordnungsMethode) zuordnungsMethodeMutable = nachlauf.zuordnungsMethode;
  signal = nachlauf.signal;
  benutzer = nachlauf.benutzer;

  const matchCtx: MatchContext = {
    haendler: haendler ? { id: haendler.id, name: haendler.name } : null,
    subunternehmer: erkannterSubunternehmer,
    haendlerName,
  };

  // Schritt 12 — Bestellung finden oder erstellen.
  // Siehe pipeline/bestellung-finden.ts für die volle Match-Reihenfolge
  // (existing-Hint → Exact → Fuzzy → AN-Veto → Cross → Betrag → Erweitert →
  // Evidence-Gate → Insert). Kann haendlerName + bestellungsart mutieren.
  const findResult = await findeOderErstelleBestellung(supabase, {
    existing_bestellung_id: input.existing_bestellung_id,
    haendler: haendler ? { id: haendler.id, name: haendler.name } : null,
    erkannterSubunternehmer,
    bestellungsart,
    haendlerName,
    absenderDomain,
    email_betreff: email_betreff ?? "",
    email_absender: email_absender ?? "",
    analyseErgebnisse,
    erkannteBestellnummer,
    erkannteAuftragsnummer,
    suchNummern,
    matchCtx,
    bestellerKuerzelMutable,
    zuordnungsMethodeMutable,
    benutzer: benutzer ? { name: benutzer.name } : null,
  });
  if (findResult.kind === "skip") {
    return findResult.response;
  }
  const bestellungId = findResult.bestellungId;
  const bestellungNeuErstellt = findResult.bestellungNeuErstellt;
  haendlerName = findResult.haendlerName;
  bestellungsart = findResult.bestellungsart;

  // 13. Dokumente speichern — siehe pipeline/dokument-persist.ts
  const persistResult = await persistAnhangDokumente(supabase, {
    bestellungId,
    analyseErgebnisse,
    email_betreff: email_betreff ?? "",
    email_absender: email_absender ?? "",
    email_datum: email_datum ?? "",
    bodyExtractedBetrag,
  });
  let dokumenteGespeichert = persistResult.dokumenteGespeichert;
  const gespeicherteTypen = persistResult.gespeicherteTypen;

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

  // 15. Body-Analyse (Vendor + KI parallel, Cache, Stub-Schutz, Field-Propagation).
  // Siehe pipeline/body-analyse.ts.
  const bodyResult = await analysiereBody(supabase, {
    bestellungId,
    bestellungNeuErstellt,
    emailText,
    emailTextStrukturiert,
    email_betreff: email_betreff ?? "",
    email_absender: email_absender ?? "",
    email_datum: email_datum ?? "",
    anhaenge: anhaenge.map((a) => ({ name: a.name, mime_type: a.mime_type, base64: a.base64 })),
    documentHint,
    startTime,
    dokumenteGespeichert,
    gespeicherteTypen,
    erkannteBestellnummer,
    bodyExtractedBetrag,
    bodyExtractedKundennummer,
    bodyExtractedIstGutschrift,
    haendlerName,
    absenderDomain,
  });
  if (bodyResult.kind === "rollback") {
    return { success: true, skipped: true, reason: bodyResult.reason };
  }
  const bodyAnalyse = bodyResult.bodyAnalyse;
  parserName = bodyResult.parserName;
  parserSource = bodyResult.parserSource;
  dokumenteGespeichert = bodyResult.dokumenteGespeichert;
  // gespeicherteTypen ist by-reference geupdated; haendlerName ggf. überschrieben.
  haendlerName = bodyResult.haendlerName;

  // 16. Fallback: Kein Dokument gespeichert
  if (dokumenteGespeichert === 0) {
    const fallbackResult = await tryFallbackKeywordTyp(supabase, bestellungId, {
      emailText,
      email_betreff,
      email_absender,
      email_datum,
      anhaenge_count: anhaenge.length,
      bestellungNeuErstellt,
      // 06.05.2026 — KI-Werte (Bestellnr/Betrag/Daten) durchreichen, damit der
      // Fallback sie ins neue Doku schreibt statt hardcoded NULLs. Vorher gingen
      // diese Werte verloren wenn die KI typ='unbekannt' lieferte.
      bodyAnalyse,
      // 15.05.2026 — Regex-Werte auch hier durchreichen, falls Body-Block nicht
      // lief (Cutoff bei 45s oder Body <100 chars) → bodyAnalyse=null aber
      // bodyExtractedBetrag/Kundennummer können trotzdem gesetzt sein (regex
      // läuft an Z. 586/Z. 612 unabhängig vom KI-Call).
      bodyExtractedBetrag,
      bodyExtractedKundennummer,
      haendlerName,
      absenderDomain,
    });
    if (fallbackResult.shortCircuit) return fallbackResult.response!;
    if (fallbackResult.gespeichert) dokumenteGespeichert = 1;
  }

  // 16b. Sanity-Check: leere Bestellung → komplett löschen + skip.
  const sanity = await sanityCleanupLeereBestellung(supabase, {
    bestellungId, bestellungNeuErstellt, dokumenteGespeichert,
    email_absender, email_betreff,
  });
  if (sanity.shouldShortCircuit) {
    return { success: true, skipped: true, reason: sanity.reason };
  }

  // 16c. Bestellnummer/Betrag aus Doku-Record propagieren falls Bestellung
  // selbst noch leer ist.
  await propagiereBestellnummerAusDoku(supabase, bestellungId);

  // 17. Händler-Auto-Erkennung (Cross-Table-Fuzzy gegen haendler/SU/abo
  // bevor neuer Händler angelegt wird) — siehe pipeline/haendler-erkennen.ts
  await autoErkenneNeuenHaendler(supabase, {
    bestellungId,
    haendler,
    analyseErgebnisse,
    email_absender: email_absender ?? "",
    email_betreff: email_betreff ?? "",
    absenderAdresse,
    startTime,
  });

  // Schritte 18-24 — Status / Abgleich / Preisanomalie / Abo / Signal /
  // UNBEKANNT-Kommentar / Webhook-Log. Siehe pipeline/post-processing.ts.
  await runPostProcessing(supabase, {
    bestellungId, bestellungsart, dokumenteGespeichert,
    haendlerDomain, haendlerName, analyseErgebnisse, signal,
    bestellerKuerzelMutable,
    email_absender: email_absender ?? "",
    email_betreff: email_betreff ?? "",
    erkannteBestellnummer,
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
