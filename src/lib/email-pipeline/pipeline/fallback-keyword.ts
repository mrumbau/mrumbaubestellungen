/**
 * Fallback-Pfad: Wenn weder Anhänge noch Body-Analyse ein Doku produzierten,
 * versuchen wir aus Body-Keywords einen Doku-Typ abzuleiten (rechnung /
 * lieferschein / bestellbestaetigung / versandbestaetigung) und legen einen
 * Stub-Doku-Record an.
 *
 * Inkl. Regex-Werte (Betrag, Kundennummer) und KI-Body-Analyse-Werte (falls
 * vorhanden) — damit beim KI-typ='unbekannt' die extrahierten Felder nicht
 * verloren gehen.
 *
 * 19.05.2026 (A2.1) — aus run.ts extrahiert. Verhalten unverändert.
 */
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DokumentAnalyse } from "@/lib/openai";
import { buildTrackingUrl } from "@/lib/tracking-urls";
import { logError, logInfo } from "@/lib/logger";
import { shouldSkipAsStubDuplicate } from "./dedup";
import { applyAnalyseToBestellung } from "./bestellung-propagate";

export interface FallbackInput {
  emailText: string;
  email_betreff: string;
  email_absender: string;
  email_datum: string;
  anhaenge_count: number;
  bestellungNeuErstellt: boolean;
  /**
   * 06.05.2026 — KI-Analyse-Result aus Schritt 15. Wenn vorhanden, werden
   * extrahierte Werte (Bestellnr, Betrag, Daten) ins Fallback-Doku übernommen
   * statt hardcoded NULLs. Greift z.B. bei Mails wo die KI typ='unbekannt'
   * liefert aber Bestellnummer/Betrag erkannt hat.
   */
  bodyAnalyse?: DokumentAnalyse | null;
  /**
   * 15.05.2026 — Regex-Fallback aus run.ts (matcht "Rechnungsbetrag/Gesamtsumme/
   * Endbetrag … X,XX €"). Greift wenn KI gesamtbetrag nicht extrahiert hat,
   * z.B. bei body-only HTML-Tabellen-Mails ohne Vendor-Parser. Wird als
   * letzte Stufe genutzt wenn auch bodyAnalyse null ist (Body-Block geskippt).
   */
  bodyExtractedBetrag?: number | null;
  /**
   * 15.05.2026 — Regex-Fallback (matcht "Kundennummer/Kunden-Nr/Customer ID: X").
   * Analog bodyExtractedBetrag — letzte Stufe wenn KI bodyAnalyse=null oder
   * kundennummer-Feld nicht extrahiert hat.
   */
  bodyExtractedKundennummer?: string | null;
  haendlerName?: string | null;
  absenderDomain?: string | null;
}

export interface FallbackResult {
  shortCircuit: boolean;
  response?: {
    success: true;
    skipped?: boolean;
    reason?: string;
    bestellung_id?: string;
  };
  gespeichert: boolean;
}

export async function tryFallbackKeywordTyp(
  supabase: SupabaseClient,
  bestellungId: string,
  input: FallbackInput,
): Promise<FallbackResult> {
  const {
    emailText, email_betreff, email_absender, email_datum,
    anhaenge_count, bestellungNeuErstellt,
    bodyAnalyse, bodyExtractedBetrag, bodyExtractedKundennummer,
    haendlerName, absenderDomain,
  } = input;

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

    // 06.05.2026 — Fallback-Insert nutzt KI-Werte (falls vorhanden) statt
    // hardcoded NULLs. Selbst wenn die KI typ='unbekannt' lieferte (deshalb
    // sind wir im Fallback gelandet), hat sie oft trotzdem Bestellnr/Betrag/
    // Daten extrahiert — die wären sonst verloren gegangen.
    // 15.05.2026 — Wenn weder KI noch ki.gesamtbetrag/kundennummer, aber Regex
    // hat einen Wert erkannt (z.B. "Rechnungsbetrag: 89,45 €" oder
    // "Kundennummer: 1380585"), nutzen wir den.
    const ki = bodyAnalyse ?? null;
    const effektiverGesamtbetrag = ki?.gesamtbetrag ?? bodyExtractedBetrag ?? null;
    const effektiveKundennummer = ki?.kundennummer || bodyExtractedKundennummer || null;
    const fallbackKiRoh: Record<string, unknown> = ki
      ? { ...(ki as unknown as Record<string, unknown>), fallback_typ: fallbackTyp, quelle: "email_body" }
      : { typ: fallbackTyp, quelle: "email_body", email_text: emailText.slice(0, 5000), gesamtbetrag: effektiverGesamtbetrag, kundennummer: effektiveKundennummer };

    // 18.05.2026 — Stub-Duplikat-Schutz (siehe pipeline/dedup.ts) auch im
    // Fallback-Pfad: wenn fallbackTyp=rechnung UND wir keinen Betrag/PDF haben
    // UND eine vollständige Rechnung mit gleicher BN existiert → skip.
    const skipFallbackAsStub = await shouldSkipAsStubDuplicate({
      supabase,
      bestellungId,
      typ: fallbackTyp,
      bestellnummerErkannt: ki?.bestellnummer ?? null,
      newGesamtbetrag: effektiverGesamtbetrag,
      newStoragePfad: null,
      emailBetreff: email_betreff,
      emailAbsender: email_absender,
    });
    if (skipFallbackAsStub) {
      return { shortCircuit: false, gespeichert: true };
    }

    // 06.05.2026 — Fallback-Insert via persist_dokument_atomic-RPC für
    // Re-Backfill-Idempotenz. content_hash = sha256(email_text) verhindert
    // doppelte Dokus beim retry derselben Mail.
    const fallbackBodyHash = createHash("sha256").update(emailText).digest("hex");
    await supabase.rpc("persist_dokument_atomic", {
      p_bestellung_id: bestellungId,
      p_typ: fallbackTyp,
      p_quelle: "email",
      p_storage_pfad: null,
      p_content_hash: fallbackBodyHash,
      p_email_betreff: email_betreff,
      p_email_absender: email_absender,
      p_email_datum: email_datum,
      p_ki_roh_daten: fallbackKiRoh,
      p_bestellnummer_erkannt: ki?.bestellnummer ?? null,
      p_auftragsnummer: ki?.auftragsnummer || null,
      p_lieferscheinnummer: ki?.lieferscheinnummer || null,
      p_artikel: (ki?.artikel ?? null) as unknown as Record<string, unknown>,
      p_gesamtbetrag: effektiverGesamtbetrag,
      p_netto: ki?.netto ?? null,
      p_mwst: ki?.mwst ?? null,
      p_faelligkeitsdatum: ki?.faelligkeitsdatum ?? null,
      p_lieferdatum: ki?.lieferdatum ?? null,
      p_iban: ki?.iban ?? null,
      p_kundennummer: effektiveKundennummer,
      p_besteller_im_dokument: ki?.besteller_im_dokument || null,
      p_projekt_referenz: ki?.projekt_referenz || null,
      p_bestelldatum: ki?.bestelldatum || null,
      p_ist_gutschrift: ki?.ist_gutschrift ?? false,
    });

    // bestellungen-Update: Flag setzen + KI-Werte (Betrag, Daten, BN) ergänzen
    // via applyAnalyseToBestellung damit Bestellnummer/betrag/faelligkeit/
    // bestelldatum/kundennummer in der UI sichtbar werden.
    // 15.05.2026 — Wenn ki null aber Regex-Betrag erkannt: betrag fill-if-empty
    // direkt setzen (applyAnalyseToBestellung wird nicht aufgerufen weil ki=null,
    // sonst bliebe bestellungen.betrag NULL trotz Regex-Treffer). Existing-Check
    // verhindert Überschreiben eines bereits gesetzten PDF-/Anhang-Betrags.
    if (ki == null && (effektiverGesamtbetrag != null || effektiveKundennummer)) {
      const { data: existingRow } = await supabase
        .from("bestellungen").select("betrag, kundennummer").eq("id", bestellungId).maybeSingle();
      if (effektiverGesamtbetrag != null && !existingRow?.betrag) {
        bestellungUpdate.betrag = effektiverGesamtbetrag;
      }
      if (effektiveKundennummer && !existingRow?.kundennummer) {
        bestellungUpdate.kundennummer = effektiveKundennummer;
      }
    }
    await supabase.from("bestellungen").update(bestellungUpdate).eq("id", bestellungId);
    if (ki) {
      await applyAnalyseToBestellung(supabase, bestellungId, ki, {
        haendlerName: haendlerName ?? "",
        absenderDomain: absenderDomain ?? "",
      });
    }
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
