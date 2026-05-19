/**
 * Bestellungs-Finder + Anlage-Logik (= Schritt 12 der Pipeline).
 *
 * Reihenfolge:
 *   1. existing_bestellung_id-Hint (Re-Backfill-Idempotenz)
 *   2. findByExactNumber (suchNummern)
 *   3. findByFuzzyNumber (Substring + Token)
 *   4. Auftragsnummer-Konflikt-Veto (Match wieder verwerfen wenn AN-Konflikt)
 *   5. Duplikat-Typ-Check (Multi-Slot / Anreicherung — kein early-skip)
 *   6. findByCrossMatch (ohne Händler-Filter)
 *   7. findByBetragMatch (gleicher Händler + Betrag, andere Nummer) → SKIP
 *   8. findByErweiterterMatch (Händler + offen + Typ-noch-nicht-da)
 *   9. Geister-/Pseudo-Bestellungs-Filter (Evidence-Gate)
 *  10. Neue Bestellung anlegen (mit haendlerName-Sanitization)
 *
 * 19.05.2026 (A2.1) — aus run.ts extrahiert. Verhalten unverändert.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logError, logInfo } from "@/lib/logger";
import { BEKANNTE_TYPEN, FLAG_MAP } from "./constants";
import type { AnalyseErgebnis } from "./anhang-analyse";
import {
  findByExactNumber,
  findByFuzzyNumber,
  findByCrossMatch,
  findByBetragMatch,
  findByErweiterterMatch,
  type MatchContext,
  type BestellungRow,
} from "./bestellung-match";

export interface FindOrCreateInput {
  existing_bestellung_id?: string | null;
  haendler: { id: string | null; name: string | null } | null;
  erkannterSubunternehmer: { id: string; firma: string } | null;
  /** Mutable — wird ggf. von "material" → "subunternehmer" upgegradet. */
  bestellungsart: "material" | "subunternehmer" | "abo";
  /** Mutable — kann durch GPT-Händler-Übernahme oder Domain-Sanitization geändert werden. */
  haendlerName: string;
  absenderDomain: string;
  email_betreff: string;
  email_absender: string;
  analyseErgebnisse: AnalyseErgebnis[];
  erkannteBestellnummer: string | null;
  erkannteAuftragsnummer: string | null;
  suchNummern: string[];
  matchCtx: MatchContext;
  bestellerKuerzelMutable: string;
  zuordnungsMethodeMutable: string;
  benutzer: { name: string | null } | null;
}

export type FindOrCreateResult =
  | {
      kind: "ok";
      bestellungId: string;
      bestellungNeuErstellt: boolean;
      /** Final geltender Wert nach Sanitization / GPT-Übernahme. */
      haendlerName: string;
      /** Final geltender Wert nach vermutete_bestellungsart-Promotion. */
      bestellungsart: "material" | "subunternehmer" | "abo";
    }
  | {
      kind: "skip";
      response: {
        success: true;
        skipped: true;
        reason: string;
        bestellung_id?: string;
      };
    };

export async function findeOderErstelleBestellung(
  supabase: SupabaseClient,
  input: FindOrCreateInput,
): Promise<FindOrCreateResult> {
  const {
    existing_bestellung_id,
    haendler,
    erkannterSubunternehmer,
    absenderDomain,
    email_betreff,
    email_absender,
    analyseErgebnisse,
    erkannteBestellnummer,
    erkannteAuftragsnummer,
    suchNummern,
    matchCtx,
    bestellerKuerzelMutable,
    zuordnungsMethodeMutable,
    benutzer,
  } = input;
  let bestellungsart = input.bestellungsart;
  let haendlerName = input.haendlerName;

  let existierendeBestellung: BestellungRow | null = null;

  // Re-Backfill-Idempotenz (05.05.2026): Wenn diese Mail in einer früheren
  // Pipeline-Run schon einer Bestellung zugeordnet war, diese als Match nehmen
  // BEVOR die normale Match-Logic läuft. Verhindert dass Re-Backfills neue
  // Bestellungen anlegen wenn die Mail-zu-Bestellung-Beziehung schon bekannt ist.
  if (existing_bestellung_id) {
    const { data: prev } = await supabase
      .from("bestellungen")
      .select("id, bestellnummer, hat_bestellbestaetigung, hat_lieferschein, hat_rechnung, hat_aufmass, hat_leistungsnachweis, hat_versandbestaetigung")
      .eq("id", existing_bestellung_id)
      .maybeSingle();
    if (prev) {
      existierendeBestellung = prev as BestellungRow;
      logInfo("webhook/email", "Re-Backfill-Idempotenz: existing_bestellung_id Match übernommen", {
        bestellung_id: existing_bestellung_id,
        bestellnummer: prev.bestellnummer,
      });
    }
  }

  if (!existierendeBestellung) {
    existierendeBestellung = await findByExactNumber(supabase, suchNummern, matchCtx);
  }

  // R5c-Bugfix: Fuzzy-Match (Substring + Token)
  if (!existierendeBestellung) {
    existierendeBestellung = await findByFuzzyNumber(supabase, suchNummern, matchCtx);
  }

  // 07.05.2026 — Auftragsnummer-Konflikt-Veto (Defense-in-Depth).
  // Egal welcher Match-Pfad oben gegriffen hat (existing_bestellung_id-Hint,
  // findByExactNumber, findByFuzzyNumber): wenn das eingehende Doku eine
  // KONKRETE Auftragsnummer hat und die Match-Bestellung eine ANDERE konkrete
  // Auftragsnummer hat → es ist eine andere Bestellung. Match verwerfen.
  if (existierendeBestellung) {
    const dokuAuftragsnr = analyseErgebnisse
      .map((e) => e.analyse.auftragsnummer)
      .find((n): n is string => !!n);
    const bestellungAuftragsnr = (existierendeBestellung as unknown as { auftragsnummer?: string | null }).auftragsnummer;
    if (dokuAuftragsnr && bestellungAuftragsnr && dokuAuftragsnr !== bestellungAuftragsnr) {
      logInfo("webhook/email", "Match-Veto: Auftragsnummer-Konflikt → neue Bestellung statt Doku-Andocken", {
        match_bestellung_id: existierendeBestellung.id,
        match_auftragsnummer: bestellungAuftragsnr,
        doku_auftragsnummer: dokuAuftragsnr,
        email_betreff,
      });
      existierendeBestellung = null;
    }
  }

  // Duplikat-Typ-Check (gleicher Dokumenttyp existiert schon).
  //
  // Drei Fälle:
  //   1. Existierende hat hat_typ=true UND validen Doku-Record mit PDF
  //      → Multi-Slot: zusätzlicher Doku-Record (z.B. Amazon Teil-Rechnung 2)
  //   2. Existierende hat hat_typ=true ABER nur Doku-Records ohne PDF
  //      → Anreichern: alte (PDF-lose) Doku-Records ersetzen mit neuem PDF
  //   3. Existierende hat hat_typ=true OHNE jeden Doku-Record (Make.com-Erbe)
  //      → Anreichern: neuer Doku-Record wird angefügt
  if (existierendeBestellung) {
    const hauptTyp = analyseErgebnisse
      .filter((e) => BEKANNTE_TYPEN.includes(e.analyse.typ))
      .map((e) => e.analyse.typ)[0];
    const flagKey = hauptTyp ? FLAG_MAP[hauptTyp] : null;
    if (flagKey && existierendeBestellung[flagKey as keyof BestellungRow]) {
      const { data: existingDoku } = await supabase
        .from("dokumente")
        .select("id, storage_pfad")
        .eq("bestellung_id", existierendeBestellung.id)
        .eq("typ", hauptTyp);

      const dokuMitPdf = (existingDoku ?? []).filter((d) => d.storage_pfad !== null);
      const dokuOhnePdf = (existingDoku ?? []).filter((d) => d.storage_pfad === null);

      if (dokuMitPdf.length === 0) {
        // Fall 2 oder 3: kein valider Doku-Record → die alten PDF-losen
        // werden ersetzt, der neue Anhang-Insert läuft normal weiter.
        if (dokuOhnePdf.length > 0) {
          await supabase
            .from("dokumente")
            .delete()
            .in("id", dokuOhnePdf.map((d) => d.id));
          logInfo("webhook/email", `Anreicherung: ${dokuOhnePdf.length} alte ${hauptTyp}-Records ohne PDF wurden für Backfill mit neuem PDF ersetzt`, {
            bestellungId: existierendeBestellung.id,
          });
        } else {
          logInfo("webhook/email", `Anreicherung: hat_${hauptTyp}=true ohne dokumente-Record (Make.com-Erbe) — wird angefügt`, {
            bestellungId: existierendeBestellung.id,
          });
        }
        // Pipeline läuft weiter — kein skip.
      } else {
        // Fall 1: Multi-Slot. Neuer Doku-Record wird zusätzlich angelegt.
        logInfo("webhook/email", `Multi-Slot: ${hauptTyp} bereits mit PDF vorhanden, neuer Anhang als zusätzlicher Doku-Record (z.B. Teil-Lieferung)`, {
          bestellungId: existierendeBestellung.id,
          existing_pdf_count: dokuMitPdf.length,
        });
        // Pipeline läuft weiter — kein skip.
      }
    }
  }

  // Cross-Match (ohne Händler-Filter)
  if (!existierendeBestellung && suchNummern.length > 0) {
    existierendeBestellung = await findByCrossMatch(supabase, suchNummern);
  }

  if (existierendeBestellung) {
    return {
      kind: "ok",
      bestellungId: existierendeBestellung.id,
      bestellungNeuErstellt: false,
      haendlerName,
      bestellungsart,
    };
  }

  // ─── Keine bestehende Bestellung gefunden → Betrag-Match / Evidence-Gate / Anlegen ───

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
        kind: "skip",
        response: {
          success: true,
          skipped: true,
          reason: "betrag_match_24h",
          bestellung_id: betragMatch.bestellungId,
        },
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
    // Stabile Auftragsnummer aus den Anhang-Analysen für Strict-Konflikt-Check
    const dokumentAuftragsnummer = analyseErgebnisse
      .map((e) => e.analyse.auftragsnummer)
      .find((n): n is string => !!n) ?? erkannteAuftragsnummer ?? null;
    const result = await findByErweiterterMatch(supabase, {
      analyseTypen,
      dokumentNummern,
      dokumentAuftragsnummer,
      erkannterBetrag,
      ctx: matchCtx,
      bestellerKuerzel: bestellerKuerzelMutable,
    });
    if (result) erweiterterMatch = result.bestellungId;
  }

  if (erweiterterMatch) {
    return {
      kind: "ok",
      bestellungId: erweiterterMatch,
      bestellungNeuErstellt: false,
      haendlerName,
      bestellungsart,
    };
  }

  // 05.05.2026 (Wurzelfix Geister-Bestellungen): Wenn ALLE Anhang-Analysen
  // parse_fehler haben UND keine BN/Betrag extrahiert wurde → KEINE neue
  // Bestellung anlegen. Stattdessen Mail als 'failed' markieren damit der
  // Auto-Retry-Cron sie später nochmal versucht (möglicherweise greift
  // dann der gpt-4o-Fallback oder ein Modell-Update).
  const allAnhaengeFailed = analyseErgebnisse.length > 0
    && analyseErgebnisse.every((e) => e.analyse.parse_fehler === true || (!e.analyse.bestellnummer && !e.analyse.gesamtbetrag && e.analyse.konfidenz === 0));
  if (allAnhaengeFailed && !erkannteBestellnummer && !erkannteAuftragsnummer) {
    logError("webhook/email", "Alle Anhang-Analysen parse_fehler + keine Subject-BN → keine Geister-Bestellung anlegen", {
      email_betreff, email_absender,
      anhang_count: analyseErgebnisse.length,
    });
    // ingest.ts catched Exceptions → markFailed → Auto-Retry-Cron versucht später nochmal
    // Verhindert dass eine null-BN-null-Betrag-Geister-Bestellung in der DB landet.
    throw new Error("parse_fehler_alle_anhaenge: Mail wird zur Wiederverarbeitung markiert");
  }

  // 06.05.2026 (Pseudo-Bestellung-Filter): Mails OHNE Anhang + OHNE
  // erkannte BN + haendlerName ist nur eine Mail-Domain → das ist
  // höchstwahrscheinlich Korrespondenz / Notification / Mahnung, KEINE
  // echte Bestellung. Verhindert die printful/rolladenplanet/wk-transport/
  // studio-46/Bau-Technik-Pseudo-Bestellungen die User im UI verwirren.
  const haendlerSiehtNachDomainAus = haendlerName === absenderDomain
    || /\.(de|com|net|info|eu|pl|org|at|ch)$/i.test(haendlerName)
    || /-mail\.com$/i.test(haendlerName);
  if (analyseErgebnisse.length === 0
      && !erkannteBestellnummer
      && !erkannteAuftragsnummer
      && haendlerSiehtNachDomainAus) {
    logError("webhook/email", "Pseudo-Bestellung verhindert: kein Anhang + keine BN + Domain-Händler → vermutlich Korrespondenz", {
      email_betreff, email_absender, haendlerName,
    });
    throw new Error("pseudo_bestellung_kein_anhang_keine_bn: Mail wird als 'failed' markiert");
  }

  // 07.05.2026 (Strukturelles Evidence-Gate): Bevor eine NEUE Bestellung
  // angelegt wird, muss mindestens eine konkrete Daten-Spur vorliegen —
  // Betrag, Bestellnummer/Auftragsnummer/Lieferscheinnummer ODER eine
  // nicht-leere Artikel-Liste. Sonst ist die Mail keine echte Transaktion,
  // sondern Korrespondenz / AGB-Update / Vertrags-Anlage / Newsletter.
  //
  // 'irrelevant'-Skip statt 'failed': Retry bringt strukturell nichts —
  // das Modell wird beim nächsten Versuch identisch antworten.
  const hatKonkreteDatenInAnhang = analyseErgebnisse.some((e) => {
    const a = e.analyse;
    const hatBetrag = typeof a.gesamtbetrag === "number" && a.gesamtbetrag > 0;
    const hatNummer = !!(a.bestellnummer || a.auftragsnummer || a.lieferscheinnummer);
    const hatArtikel = Array.isArray(a.artikel) && a.artikel.length > 0;
    return hatBetrag || hatNummer || hatArtikel;
  });
  if (!hatKonkreteDatenInAnhang && !erkannteBestellnummer && !erkannteAuftragsnummer) {
    logInfo("webhook/email", "Pseudo-Bestellung verhindert: keine konkreten Daten in Mail oder Anhängen", {
      email_betreff,
      email_absender,
      haendlerName,
      anhang_count: analyseErgebnisse.length,
      typen: analyseErgebnisse.map((e) => e.analyse.typ),
      konfidenzen: analyseErgebnisse.map((e) => e.analyse.konfidenz),
    });
    return {
      kind: "skip",
      response: {
        success: true,
        skipped: true,
        reason: "keine_konkreten_daten",
      },
    };
  }

  // ─── Neue Bestellung anlegen ──────────────────────────────────────────

  // KI-Heuristik: vermutete_bestellungsart promotion
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

  // 06.05.2026 — Letzte Verteidigung: wenn haendlerName immer noch wie
  // eine Mail-Domain aussieht (KI hat keinen Firmennamen erkannt), markiere
  // das im UI klar erkennbar. Verhindert dass "rolladenplanet.info" oder
  // "studio-46.eu" als Pseudo-Händler in der Liste erscheinen.
  if (/\.(de|com|net|info|eu|pl|org|at|ch)$/i.test(haendlerName) && !haendlerName.includes(" ")) {
    haendlerName = `Unbekannter Lieferant (${haendlerName})`;
    logInfo("webhook/email", `haendlerName war Domain — markiert als 'Unbekannter Lieferant'`, {
      original: absenderDomain,
    });
  }

  // 08.05.2026 — Bestellnummer-Priorität: Auftragsnummer > Bestellnummer
  // (aus Subject) > Rechnungsnummer (aus Doku). NIEMALS Lieferscheinnummer.
  // Auftragsnummer ist die stabilste Identifikation einer Bestellung
  // (bleibt über alle Doku-Typen gleich); Bestellnummer aus Subject kann
  // bei Rechnungs-Mails auch eine Rechnungsnummer sein.
  const dokuAuftragsnr = analyseErgebnisse
    .map((e) => e.analyse.auftragsnummer)
    .find((n): n is string => !!n);
  const dokuRechnungsnr = analyseErgebnisse
    .find((e) => e.analyse.typ === "rechnung")?.analyse.bestellnummer;
  const initialeBestellnummer =
    dokuAuftragsnr
    ?? erkannteAuftragsnummer
    ?? erkannteBestellnummer
    ?? dokuRechnungsnr
    ?? null;

  const { data: neue, error: insertError } = await supabase
    .from("bestellungen")
    .insert({
      bestellnummer: initialeBestellnummer,
      auftragsnummer: dokuAuftragsnr ?? erkannteAuftragsnummer ?? null,
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

  let bestellungId: string;
  if (insertError && erkannteBestellnummer) {
    const { data: fallback } = await supabase
      .from("bestellungen")
      .select("id")
      .eq("bestellnummer", erkannteBestellnummer)
      .limit(1)
      .maybeSingle();
    if (fallback) {
      bestellungId = fallback.id;
      return {
        kind: "ok",
        bestellungId,
        bestellungNeuErstellt: false,
        haendlerName,
        bestellungsart,
      };
    } else {
      throw new Error("Bestellung konnte weder angelegt noch gefunden werden");
    }
  }
  if (!neue) {
    throw new Error("Bestellung konnte nicht angelegt werden");
  }
  bestellungId = neue.id;
  return {
    kind: "ok",
    bestellungId,
    bestellungNeuErstellt: true,
    haendlerName,
    bestellungsart,
  };
}
