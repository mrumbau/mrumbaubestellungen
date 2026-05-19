/**
 * Persistiert die analysierten Anhang-Dokumente in Storage + dokumente-Tabelle.
 *
 * Pro Anhang:
 *   1. Strict-VB-Subject-Override (KI BB → VB wenn Subject eindeutig Versand)
 *   2. typ="anlage"-Skip (AGB/Widerruf/Datenschutz)
 *   3. Vision-Fallback bei typ=unbekannt/parse_fehler (Subject → DokuTyp)
 *   4. Base64 → Buffer + Content-Hash (PDF-Duplikat-Schutz)
 *   5. Storage-Upload (Pfad: <bestellungId>/<typ>_<hash16>_<sanitized-filename>)
 *   6. persist_dokument_atomic-RPC + applyAnalyseToBestellung
 *
 * 19.05.2026 (A2.1) — aus run.ts extrahiert. Verhalten unverändert.
 */
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logError, logInfo } from "@/lib/logger";
import { isStrictVersandBetreff, safeBase64ToBuffer } from "./mail-utils";
import { BEKANNTE_TYPEN } from "./constants";
import { applyAnalyseToBestellung } from "./bestellung-propagate";
import type { AnalyseErgebnis } from "./anhang-analyse";

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

export interface PersistAnhangInput {
  bestellungId: string;
  analyseErgebnisse: AnalyseErgebnis[];
  email_betreff: string;
  email_absender: string;
  email_datum: string;
  /** Body-Regex-Fallback wird als gesamtbetrag-Default verwendet falls KI-Wert null. */
  bodyExtractedBetrag: number | null;
}

export interface PersistAnhangResult {
  dokumenteGespeichert: number;
  gespeicherteTypen: string[];
}

export async function persistAnhangDokumente(
  supabase: SupabaseClient,
  input: PersistAnhangInput,
): Promise<PersistAnhangResult> {
  const { bestellungId, analyseErgebnisse, email_betreff, email_absender, email_datum, bodyExtractedBetrag } = input;
  let dokumenteGespeichert = 0;
  const gespeicherteTypen: string[] = [];

  for (const ergebnis of analyseErgebnisse) {
    const { analyse, dateiName, base64, mime_type } = ergebnis;

    // 06.05.2026 — Strict-VB-Subject-Override: bei eindeutigen Versand-Subjects
    // ("ist unterwegs", "wird zugestellt", "voraussichtlicher Liefertermin")
    // überstimmt das einen falschen KI-Klassifizierten BB-Typ. Verhindert die
    // CHECK24/Megabad-Misklassifikation. Greift NUR wenn KI BB sagt — wenn KI
    // schon VB sagt, kein Eingriff.
    if (analyse.typ === "bestellbestaetigung" && isStrictVersandBetreff(email_betreff || "")) {
      logInfo("webhook/email", `Strict-VB-Override: KI sagte bestellbestaetigung, Subject ist eindeutig Versand`, {
        subject: email_betreff,
      });
      analyse.typ = "versandbestaetigung";
    }

    // 07.05.2026 — typ="anlage" ist KI-EXPLIZIT (AGB/Widerruf/Datenschutz/etc.)
    // und darf NICHT durch Subject-Fallback umetikettiert werden. Sonst würde
    // eine "Bestellbestätigung: EnBW Ladekarte"-Mail die mitgeschickte AGB-PDF
    // als Bestellbestätigung persistieren — genau der Bug, den wir abstellen.
    if (analyse.typ === "anlage") {
      logInfo("webhook/email", `Anhang übersprungen: typ="anlage" (Begleit-Dokument, keine Transaktion)`, {
        datei: dateiName,
        subject: (email_betreff ?? "").slice(0, 80),
      });
      continue;
    }

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

    // 06.05.2026 — PDF-Content-Hash. Verhindert Doku-Duplikate über exakt
    // gleiches PDF (Reply-Mails mit gleichem Anhang, Re-Backfill-Doppelt-
    // Verarbeitung). Pre-Insert-Check + Partial-Unique-Index als doppelte
    // Verteidigung. Storage-Pfad enthält den Hash damit auch das Storage-
    // File deterministisch ist (kein Date.now()-Random-Suffix mehr).
    const contentHash = createHash("sha256").update(buffer).digest("hex");
    const { data: existingDoku } = await supabase
      .from("dokumente")
      .select("id, storage_pfad")
      .eq("bestellung_id", bestellungId)
      .eq("typ", analyse.typ)
      .eq("content_hash", contentHash)
      .limit(1);
    if (existingDoku && existingDoku.length > 0) {
      logInfo("webhook/email", `Doku-Duplikat erkannt via content_hash — übersprungen`, {
        bestellungId, typ: analyse.typ, content_hash: contentHash.slice(0, 16),
        bestehender_pfad: existingDoku[0].storage_pfad,
      });
      continue;
    }

    const storagePfad = `${bestellungId}/${analyse.typ}_${contentHash.slice(0, 16)}_${sanitizeStorageFilename(dateiName)}`;
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

    // 06.05.2026 (Welle 2 C4) — atomic-Persist via RPC mit Pre-Insert-Check.
    // Vorher: direkter INSERT → bei content_hash-Konflikt (Race-Condition,
    // Doppel-Webhook) gab's Unique-Constraint-Error. Jetzt: RPC macht
    // Pre-Check + idempotenter Return des existierenden doku_id.
    const { error: insertError } = await supabase.rpc("persist_dokument_atomic", {
      p_bestellung_id: bestellungId,
      p_typ: analyse.typ,
      p_quelle: "email",
      p_storage_pfad: storagePfad,
      p_content_hash: contentHash,
      p_email_betreff: email_betreff ?? null,
      p_email_absender: email_absender ?? null,
      p_email_datum: email_datum ?? null,
      p_ki_roh_daten: analyse as unknown as Record<string, unknown>,
      p_bestellnummer_erkannt: analyse.bestellnummer ?? null,
      p_auftragsnummer: analyse.auftragsnummer || null,
      p_lieferscheinnummer: analyse.lieferscheinnummer || null,
      p_artikel: analyse.artikel as unknown as Record<string, unknown>,
      p_gesamtbetrag: analyse.gesamtbetrag ?? bodyExtractedBetrag,
      p_netto: analyse.netto,
      p_mwst: analyse.mwst,
      p_faelligkeitsdatum: analyse.faelligkeitsdatum,
      p_lieferdatum: analyse.lieferdatum,
      p_iban: analyse.iban,
      p_kundennummer: analyse.kundennummer || null,
      p_besteller_im_dokument: analyse.besteller_im_dokument || null,
      p_projekt_referenz: analyse.projekt_referenz || null,
      p_bestelldatum: analyse.bestelldatum || null,
      p_ist_gutschrift: analyse.ist_gutschrift ?? false,
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

  return { dokumenteGespeichert, gespeicherteTypen };
}
