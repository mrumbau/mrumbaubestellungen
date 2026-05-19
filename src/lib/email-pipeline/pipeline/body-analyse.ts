/**
 * Body-Analyse-Block (= Schritt 15 der Pipeline).
 *
 * Vendor-Parser + KI parallel auf den E-Mail-Body, Cache-Hit-Optimierung,
 * Betreff-Korrektur, Regex-Wert-Merge (Betrag/Kundennummer/Gutschrift),
 * Stub-Duplikat-Check, neuer Doku-Record bei neuem Typ oder Field-Propagation
 * bei bekanntem Typ.
 *
 * 45s-Cutoff: bei Pipeline-Laufzeit > 45s wird der Body-Block geskippt und
 * stattdessen ein Warning in webhook_logs persistiert (Cron findet betroffene
 * Mails via failed-Status für Retry).
 *
 * 19.05.2026 (A2.1) — aus run.ts extrahiert. Verhalten unverändert.
 */
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { analysiereDokument, type DokumentAnalyse } from "@/lib/openai";
import { tryParseVendor, mergeVendorIntoKi } from "@/lib/email-pipeline/vendor-parsers";
import { logError, logInfo } from "@/lib/logger";
import { BEKANNTE_TYPEN } from "./constants";
import { getCachedAnalyse, setCachedAnalyse, hashBody } from "./anhang-analyse";
import { shouldSkipAsStubDuplicate } from "./dedup";
import { applyAnalyseToBestellung, ergaenzeFelder } from "./bestellung-propagate";

export interface BodyAnalyseInput {
  bestellungId: string;
  bestellungNeuErstellt: boolean;
  /** Plain-Text-Body (HTML stripped). Trigger für Block-Run wenn > 100 chars. */
  emailText: string;
  /** HTML→Plain mit Tabellen-Erhalt. Bevorzugt für KI + Vendor wenn vorhanden. */
  emailTextStrukturiert: string;
  email_betreff: string;
  email_absender: string;
  email_datum: string;
  anhaenge: Array<{ name: string; mime_type: string; base64: string }>;
  documentHint: string | null;
  /** Start-Timestamp der Pipeline-Run (Date.now()) — für 45s-Cutoff. */
  startTime: number;
  dokumenteGespeichert: number;
  gespeicherteTypen: string[];
  erkannteBestellnummer: string | null;
  bodyExtractedBetrag: number | null;
  bodyExtractedKundennummer: string | null;
  bodyExtractedIstGutschrift: boolean;
  haendlerName: string;
  absenderDomain: string;
}

export type BodyAnalyseResult =
  | {
      kind: "rollback";
      reason: string;
    }
  | {
      kind: "ok";
      bodyAnalyse: DokumentAnalyse | null;
      parserName: string | null;
      parserSource: "vendor" | "ki";
      dokumenteGespeichert: number;
      gespeicherteTypen: string[];
      haendlerName: string;
    };

export async function analysiereBody(
  supabase: SupabaseClient,
  input: BodyAnalyseInput,
): Promise<BodyAnalyseResult> {
  const {
    bestellungId, bestellungNeuErstellt,
    emailText, emailTextStrukturiert,
    email_betreff, email_absender, email_datum,
    anhaenge, documentHint, startTime,
    erkannteBestellnummer,
    bodyExtractedBetrag, bodyExtractedKundennummer, bodyExtractedIstGutschrift,
    absenderDomain,
  } = input;
  let dokumenteGespeichert = input.dokumenteGespeichert;
  const gespeicherteTypen = input.gespeicherteTypen;
  let haendlerName = input.haendlerName;
  let bodyAnalyse: DokumentAnalyse | null = null;
  let parserName: string | null = null;
  let parserSource: "vendor" | "ki" = "ki";

  // 06.05.2026 — Cutoff-Logging: wenn wir die Body-Analyse skippen wegen 45s-Limit,
  // wird das jetzt explizit geloggt + in webhook_logs persistiert. Vorher wurde
  // skip stillschweigend gemacht und der Fallback-Pfad lief mit unvollständigen
  // Daten weiter. Mit Logging können wir Mails finden die vom Cutoff betroffen
  // sind und sie später re-processen (retry-Cron findet sie via 'failed').
  const istBodyTimeout = emailText.length > 100 && Date.now() - startTime >= 45_000;
  if (istBodyTimeout) {
    logError("webhook/email", "Body-Analyse SKIP wegen 45s-Cutoff — Mail wird mit Anhang-Werten weitergeführt", {
      bestellungId,
      email_betreff,
      email_absender,
      elapsed_ms: Date.now() - startTime,
      anhaenge_count: anhaenge.length,
    });
    // webhook_logs-Eintrag damit Admin sieht welche Mails Cutoff-betroffen sind
    void supabase.from("webhook_logs").insert({
      typ: "pipeline_cutoff",
      status: "warning",
      bestellung_id: bestellungId,
      fehler_text: `Body-Analyse-Cutoff bei 45s — Mail "${(email_betreff || "").slice(0, 80)}" von ${email_absender} (${anhaenge.length} Anhänge). Bei unvollständigen Werten retry-failed-emails-Cron triggern.`,
    }).then(() => undefined);
  }

  if (emailText && emailText.length > 100 && Date.now() - startTime < 45_000) {
    try {
      // Vendor-Parser bekommen den strukturerhaltenden Text wenn HTML-Body
      // vorhanden war. Bei Plain-Text-Mails ist emailTextStrukturiert ≈ emailText.
      // Tabellen-Cells sind via ` | ` getrennt, was Regex-Matches auf Spalten
      // (z.B. Brutto-Spalte in Telekom-/Brillux-/Raab-Karcher-Mails) erleichtert.
      const vendorEmailText = emailTextStrukturiert && emailTextStrukturiert.length > 50
        ? emailTextStrukturiert
        : emailText;
      const vendorResult = await tryParseVendor({
        email_absender: email_absender || "",
        email_betreff: email_betreff || "",
        email_text: vendorEmailText,
        // Anhänge durchreichen — Parser können PDF-Filename-Pattern matchen
        // (z.B. Telekom: Rechnung_<digits>_<datum>.pdf, Brillux: RE-<n>-<datum>-<kunde>.pdf).
        // Inhalt (base64) ist enthalten falls ein Parser ZUGFeRD-XML aus PDF lesen will.
        anhaenge: anhaenge.map((a) => ({ name: a.name, mime_type: a.mime_type, base64: a.base64 })),
      });

      // Always-KI (05.05.2026): KI läuft IMMER parallel zum Vendor-Parser.
      // Vendor-Parser-Hints werden via mergeVendorIntoKi gemerged. Vorher hatten
      // wir bei Vendor-Konfidenz ≥0.75 die KI komplett geskipped — das hat
      // Vendor-Parser-Lücken (z.B. fehlende BN/Beträge im PDF) ungenutzt gelassen.
      // Cost-Trade: ~5x höhere OpenAI-Cost, dafür konsistente PDF-Inhalts-Extraktion.
      // KI bekommt strukturerhaltenden Text (Tabellen mit ` | ` zwischen Cells,
      // Block-Elemente als Newlines). Bei reinen Plain-Text-Mails fällt es auf
      // emailText (flat) zurück damit nichts verloren geht.
      const kiBody = emailTextStrukturiert && emailTextStrukturiert.length > 50
        ? emailTextStrukturiert
        : emailText;
      const bodyMitBetreff = email_betreff
        ? `E-Mail Betreff: ${email_betreff}\nAbsender: ${email_absender || ""}\n\n${kiBody.slice(0, 15000)}`
        : kiBody.slice(0, 15000);

      // 06.05.2026 — Body-Cache via openai_analysis_cache (Hash-basiert).
      // Bei wiederkehrenden Mails (Telekom-Abo, Amazon-Reminder mit identischem
      // Footer, Buchhaltungs-Erinnerungen) trifft der Cache → spart ~20%
      // OpenAI-Cost und beschleunigt Pipeline um ~3-5s pro Mail.
      // Bei DB-Fehler fail-open: KI-Call läuft normal.
      const bodyHashKey = hashBody(bodyMitBetreff);
      let bodyAnalyseLokal: DokumentAnalyse | null = await getCachedAnalyse(supabase, bodyHashKey);
      if (bodyAnalyseLokal) {
        logInfo("webhook/email", "Body-Cache HIT — KI-Call übersprungen", {
          email_betreff,
          hash_prefix: bodyHashKey.slice(0, 12),
        });
      } else {
        const bodyBase64 = Buffer.from(bodyMitBetreff).toString("base64");
        bodyAnalyseLokal = await analysiereDokument(bodyBase64, "text/plain", {
          folderHint: documentHint || undefined,
        });
        // Best-effort Cache-Write (nur wenn KI brauchbares Ergebnis lieferte).
        if (bodyAnalyseLokal && bodyAnalyseLokal.typ !== "unbekannt") {
          void setCachedAnalyse(supabase, bodyHashKey, "text/plain", bodyAnalyseLokal);
        }
      }

      if (vendorResult && vendorResult.result.documents.length > 0) {
        const vendorDoc = vendorResult.result.documents[0];
        bodyAnalyseLokal = mergeVendorIntoKi(bodyAnalyseLokal, vendorDoc);
        parserName = vendorResult.result.vendor;
        parserSource = vendorResult.acceptWithoutKI ? "vendor" : "ki";
        logInfo("webhook/email", "Vendor + KI parallel", {
          vendor: parserName,
          vendor_konfidenz: vendorResult.result.konfidenz,
          ki_konfidenz: bodyAnalyseLokal.konfidenz,
          accept_without_ki_war_aktiviert: vendorResult.acceptWithoutKI,
          merged_bestellnummer: bodyAnalyseLokal.bestellnummer,
          merged_typ: bodyAnalyseLokal.typ,
        });
      }

      // Betreff-Korrektur
      if (email_betreff) {
        const betreffLower = email_betreff.toLowerCase();
        const betreffIstBestellung = ["ihre bestellung", "bestellbestätigung", "auftragsbestätigung", "order confirmation", "bestellung eingegangen", "bestellung bei"].some((kw) => betreffLower.includes(kw));
        if (betreffIstBestellung && bodyAnalyseLokal.typ === "versandbestaetigung") {
          logInfo("webhook/email", "Betreff-Korrektur: Versand → Bestellung", { email_betreff, gpt_typ: bodyAnalyseLokal.typ });
          bodyAnalyseLokal.typ = "bestellbestaetigung";
        }
      }

      // 15.05.2026 — Regex-Fallback `bodyExtractedBetrag` ins KI-Result mergen.
      // Vorher landete der Wert NUR in dokumente.gesamtbetrag, aber NICHT in
      // bestellungen.betrag, weil applyAnalyseToBestellung und ergaenzeFelder
      // nur bodyAnalyseLokal.gesamtbetrag lesen.
      if (bodyAnalyseLokal.gesamtbetrag == null && bodyExtractedBetrag != null) {
        bodyAnalyseLokal.gesamtbetrag = bodyExtractedBetrag;
      }
      // Analog für Kundennummer (Bernstein: "Deine Kundennummer: 1380585" wird
      // von der KI bei body-only HTML oft nicht extrahiert).
      if (!bodyAnalyseLokal.kundennummer && bodyExtractedKundennummer) {
        bodyAnalyseLokal.kundennummer = bodyExtractedKundennummer;
      }
      // 17.05.2026 — Gutschrift-Flag: bodyExtractedIstGutschrift überschreibt
      // niemals true→false (KI hat möglicherweise Kontext den Regex nicht hat),
      // aber kann false→true setzen wenn Regex eindeutiges Signal hat.
      if (bodyExtractedIstGutschrift && !bodyAnalyseLokal.ist_gutschrift) {
        bodyAnalyseLokal.ist_gutschrift = true;
      }

      // Outer-Variable für Fallback-Pfad zuweisen — auch bei typ=unbekannt,
      // weil die KI-Werte (Bestellnr, Betrag, Daten) im Fallback genutzt werden.
      bodyAnalyse = bodyAnalyseLokal;

      // Body-only Versand-Rollback
      if (bodyAnalyseLokal.typ === "versandbestaetigung" && bestellungNeuErstellt && dokumenteGespeichert === 0) {
        logInfo("webhook/email", "Rollback: Body-only Versandbestätigung", {
          bestellungId, email_absender, email_betreff,
        });
        await supabase.from("dokumente").delete().eq("bestellung_id", bestellungId);
        await supabase.from("bestellungen").delete().eq("id", bestellungId);
        return { kind: "rollback", reason: "versand_body_ohne_bestellung" };
      }

      if (BEKANNTE_TYPEN.includes(bodyAnalyseLokal.typ) && !gespeicherteTypen.includes(bodyAnalyseLokal.typ)) {
        // 18.05.2026 — Stub-Duplikat-Schutz: verhindert Race-Condition-Duplikate
        // (Brillux 7004572-Pattern) und Reminder-Mail-Stubs (Klaus Alter 78611).
        // Wenn das Body-Doku nur ein Stub wäre (kein Betrag, kein PDF) und
        // bereits ein vollständiges Rechnungs-Doku mit derselben Bestellnummer
        // existiert → skip persist statt Duplikat in der Buchhaltung.
        const skipAsStub = await shouldSkipAsStubDuplicate({
          supabase,
          bestellungId,
          typ: bodyAnalyseLokal.typ,
          bestellnummerErkannt: bodyAnalyseLokal.bestellnummer ?? erkannteBestellnummer,
          newGesamtbetrag: bodyAnalyseLokal.gesamtbetrag ?? bodyExtractedBetrag,
          newStoragePfad: null,
          emailBetreff: email_betreff,
          emailAbsender: email_absender,
        });
        if (skipAsStub) {
          dokumenteGespeichert++; // Damit Schritt 16 nicht fälschlich Fallback triggert
          gespeicherteTypen.push(bodyAnalyseLokal.typ);
        } else {
          // Neuer Typ aus Body — über persist_dokument_atomic damit Re-Backfill
          // existing Dokus updated statt zu duplizieren (06.05.2026).
          // content_hash auf Body-Hash setzen für Idempotenz.
          const bodyHash = createHash("sha256").update(emailText).digest("hex");
          await supabase.rpc("persist_dokument_atomic", {
            p_bestellung_id: bestellungId,
            p_typ: bodyAnalyseLokal.typ,
            p_quelle: "email",
            p_storage_pfad: null,
            p_content_hash: bodyHash,
            p_email_betreff: email_betreff,
            p_email_absender: email_absender,
            p_email_datum: email_datum,
            p_ki_roh_daten: bodyAnalyseLokal as unknown as Record<string, unknown>,
            p_bestellnummer_erkannt: bodyAnalyseLokal.bestellnummer ?? erkannteBestellnummer,
            p_auftragsnummer: bodyAnalyseLokal.auftragsnummer || null,
            p_lieferscheinnummer: bodyAnalyseLokal.lieferscheinnummer || null,
            p_artikel: (bodyAnalyseLokal.artikel ?? null) as unknown as Record<string, unknown>,
            p_gesamtbetrag: bodyAnalyseLokal.gesamtbetrag ?? bodyExtractedBetrag,
            p_netto: bodyAnalyseLokal.netto,
            p_mwst: bodyAnalyseLokal.mwst,
            p_faelligkeitsdatum: bodyAnalyseLokal.faelligkeitsdatum,
            p_lieferdatum: bodyAnalyseLokal.lieferdatum,
            p_iban: bodyAnalyseLokal.iban,
            p_kundennummer: bodyAnalyseLokal.kundennummer || null,
            p_besteller_im_dokument: bodyAnalyseLokal.besteller_im_dokument || null,
            p_projekt_referenz: bodyAnalyseLokal.projekt_referenz || null,
            p_bestelldatum: bodyAnalyseLokal.bestelldatum || null,
            p_ist_gutschrift: bodyAnalyseLokal.ist_gutschrift ?? false,
          });

          const haendlerNameAfter = await applyAnalyseToBestellung(supabase, bestellungId, bodyAnalyseLokal, {
            haendlerName,
            absenderDomain,
          });
          if (haendlerNameAfter) haendlerName = haendlerNameAfter;
          dokumenteGespeichert++;
          gespeicherteTypen.push(bodyAnalyseLokal.typ);
        }
      } else if (BEKANNTE_TYPEN.includes(bodyAnalyseLokal.typ)) {
        // Nur Felder ergänzen
        await ergaenzeFelder(supabase, bestellungId, bodyAnalyseLokal, haendlerName, absenderDomain);
      } else {
        // 06.05.2026 — Werte-Propagation auch bei typ='unbekannt': KI hat
        // ggf. Bestellnummer/Betrag/Datum extrahiert, auch wenn sie den
        // Doku-Typ nicht erkannt hat. Wir propagieren diese Werte trotzdem
        // in die `bestellungen`-Tabelle, sodass die UI sie sieht.
        const hatExtrahierteWerte =
          bodyAnalyseLokal.bestellnummer ||
          bodyAnalyseLokal.gesamtbetrag != null ||
          bodyAnalyseLokal.faelligkeitsdatum ||
          bodyAnalyseLokal.bestelldatum ||
          bodyAnalyseLokal.kundennummer ||
          bodyAnalyseLokal.projekt_referenz ||
          bodyAnalyseLokal.auftragsnummer;
        if (hatExtrahierteWerte) {
          logInfo("webhook/email", "Werte-Propagation bei typ='unbekannt'", {
            bestellungId, typ: bodyAnalyseLokal.typ, bn: bodyAnalyseLokal.bestellnummer, betrag: bodyAnalyseLokal.gesamtbetrag,
          });
          await ergaenzeFelder(supabase, bestellungId, bodyAnalyseLokal, haendlerName, absenderDomain);
        }
      }
    } catch (bodyErr) {
      logError("webhook/email", "Body-Analyse fehlgeschlagen", bodyErr);
    }
  }

  return {
    kind: "ok",
    bodyAnalyse,
    parserName,
    parserSource,
    dokumenteGespeichert,
    gespeicherteTypen,
    haendlerName,
  };
}
