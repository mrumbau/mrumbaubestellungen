/**
 * Regex-basierte Subject/Body-Extraktion:
 *
 *   • Bestellnummern aus Subject (Amazon, Hash-Prefix, Auftragsnummer-Patterns,
 *     "Deine Bestellung X"-Possessiv-Pattern, Rechnungs/Lieferschein-Nummer)
 *   • Betrag aus Body ("Rechnungsbetrag/Gesamtsumme/Endbetrag … X,XX €")
 *   • Kundennummer aus Body ("Kundennummer/Customer ID: X")
 *   • Gutschrift-Flag aus Body (Rückerstattungsbetrag/Guthaben/Credit Note)
 *
 * Deterministisch, kostenlos, läuft IMMER parallel zur KI-Analyse —
 * Defense-in-Depth gegen KI-Extraktions-Lücken.
 *
 * 19.05.2026 (A2.1) — aus run.ts extrahiert. Verhalten unverändert.
 */
import { logInfo } from "@/lib/logger";
import { safeBestellnummer } from "@/lib/validation";
import type { AnalyseErgebnis } from "./anhang-analyse";

export interface BodyHintsInput {
  email_betreff: string;
  email_body: string;
  analyseErgebnisse: AnalyseErgebnis[];
  /** Aktuell beste Bestellnummer aus KI-Analyse (kann durch Subject-Match überschrieben werden). */
  erkannteBestellnummer: string | null;
  /** Aktuell beste Auftragsnummer aus KI-Analyse (read-only — verhindert Doppel-Hits). */
  erkannteAuftragsnummer: string | null;
  /** Aktuell beste Lieferscheinnummer aus KI-Analyse (read-only — verhindert Doppel-Hits). */
  erkannteLieferscheinnummer: string | null;
}

export interface BodyHints {
  /** Ggf. überschriebene Bestellnummer (wenn KI keine hatte und Subject einen Match liefert). */
  erkannteBestellnummer: string | null;
  /** Cross-Reference-Nummern aus Subject (für findByExactNumber/findByFuzzyNumber). */
  subjectExtraNummern: string[];
  /** Bruttowert wenn KI gesamtbetrag null hatte (z.B. body-only Mails). */
  bodyExtractedBetrag: number | null;
  /** Kundennummer wenn KI keine extrahiert hat. */
  bodyExtractedKundennummer: string | null;
  /** true wenn Subject/Body Gutschrift-Trigger enthält (ODER-Logik mit KI-Flag). */
  bodyExtractedIstGutschrift: boolean;
}

export function extractBodyHints(input: BodyHintsInput): BodyHints {
  const { email_betreff, email_body, analyseErgebnisse, erkannteAuftragsnummer, erkannteLieferscheinnummer } = input;
  let erkannteBestellnummer = input.erkannteBestellnummer;

  // ─── Subject-Pattern für Bestellnummer ───────────────────────────────
  // F5.X Fix: Body-/Subject-Pattern für Bestellnummer.
  // 05.05.2026 (Wurzelfix MobiHero-Drift): Subject-Pattern läuft IMMER (nicht
  // nur als Fallback bei fehlender KI-BN). Sammelt zusätzliche Cross-Reference-
  // Nummern für die Match-Logic. Beispiel MobiHero: KI extrahiert aus PDF die
  // Rechnungsnr "21092906", Subject sagt aber "Ihre Rechnung zur Bestellung 54255120".
  const subjectExtraNummern: string[] = [];
  {
    const haystack = `${email_betreff}\n${email_body}`;

    const patterns: Array<{ name: string; regex: RegExp }> = [
      // Amazon: "302-0733687-4332321"
      { name: "amazon", regex: /\b\d{3}-\d{7}-\d{7}\b/ },
      // Deutsche Shops: "BESTELLNR.: #DH39680" / "Bestell-Nr.: 12345" / "Bestellnummer: ABC-123"
      { name: "bestellnr-prefix", regex: /(?:bestell(?:[\s-]*nr|nummer|nr\.|-?nummer)|order[\s-]*(?:nr|number|id))[\s.:#-]*(#?[A-Z0-9][A-Z0-9_/-]{3,40})/i },
      // Deutsche Shop-Mails: "Deine/Ihre Bestellung 3006915 ist am ..." (Possessivpronomen + Bestellung + Digits)
      { name: "possessiv-bestellung", regex: /\b(?:deine|ihre|eure|meine|unsere)\s+bestellung\s+([A-Z]*[0-9]{4,20}[A-Z0-9_/-]*)\b/i },
      // "#DH39680" oder "#12345" mit Hash-Prefix (mind. 4 alphanumerisch + 1 Digit)
      { name: "hash-prefix", regex: /#([A-Z]*[0-9]+[A-Z0-9_/-]*)\b/i },
      // 06.05.2026 — Rechnungsnummer/Lieferscheinnummer/RechNr-Patterns.
      { name: "rechnungsnummer", regex: /\brechnungs?\s*[\s.:#-]*nummer[\s.:#-]*\s*([A-Z]*[0-9][A-Z0-9_/-]{2,30})\b/i },
      { name: "rechnung-nr", regex: /\brech(?:nung)?\s*[-.\s]*nr\.?\s*[:#-]?\s*([A-Z]*[0-9][A-Z0-9_/-]{2,30})\b/i },
      { name: "lieferscheinnummer", regex: /\blieferschein(?:s)?\s*[\s.:#-]*nummer[\s.:#-]*\s*([A-Z]*[0-9][A-Z0-9_/-]{2,30})\b/i },
      { name: "auftragsnummer", regex: /\bauftrag(?:s)?\s*[\s.:#-]*nummer[\s.:#-]*\s*([A-Z]*[0-9][A-Z0-9_/-]{2,30})\b/i },
      // "Auftrag: 2030561109" / "Rechnung Nr 12345" — bisheriger Fallback
      { name: "auftrag-rechnung", regex: /(?:auftrag(?:s[\s-]*nr|s[\s-]*nummer)?|rechnung)[\s.:#-]*(?:nr\.?:?|nummer:?)?\s*([A-Z]*[0-9]+[A-Z0-9_/-]{2,20})\b/i },
    ];

    for (const p of patterns) {
      const match = haystack.match(p.regex);
      const candidate = match ? (match[1] ?? match[0]) : null;
      const validated = safeBestellnummer(candidate);
      if (!validated) continue;

      // Erst-Treffer: Hauptnummer-Fallback wenn KI nichts hatte
      if (!erkannteBestellnummer) {
        erkannteBestellnummer = validated;
        logInfo("webhook/email", `Bestellnummer-Body-Fallback gegriffen (${p.name}): ${validated}`, { email_betreff });
      } else if (validated !== erkannteBestellnummer && validated !== erkannteAuftragsnummer && validated !== erkannteLieferscheinnummer) {
        // Zusatznummer (Cross-Reference) — wenn nicht bereits in den KI-Nummern
        subjectExtraNummern.push(validated);
        logInfo("webhook/email", `Subject-Cross-Reference-Nummer (${p.name}): ${validated}`, { email_betreff });
      }
    }
  }

  // ─── Betrag-Body-Fallback ────────────────────────────────────────────
  // F5.Y Fix: Wenn KI keinen Betrag erkannt hat, im Body nach Patterns
  // wie "Bestellwert 547,95 €" / "Gesamtsumme: 1.234,56 EUR" suchen.
  let bodyExtractedBetrag: number | null = null;
  if (!analyseErgebnisse.find((e) => e.analyse.gesamtbetrag)?.analyse.gesamtbetrag) {
    const body = `${email_betreff}\n${email_body}`;
    const betragPatterns: RegExp[] = [
      // 15.05.2026 — Erweitert um Standard-Vokabular deutscher Shops:
      //   • Zahlbetrag (Bernstein) • Zu zahlen/Zu zahlender Betrag (PayPal-Style)
      //   • Endsumme/Brutto-Endsumme • Insgesamt (PayPal-Confirms, Amazon)
      //   • Bestellbetrag/Auftragssumme • Rechnungssumme
      // Reihenfolge: spezifische Brutto-Schlagwörter VOR generischem `summe`/`betrag`.
      /(?:zahlbetrag|zu[\s.-]*zahlen(?:der[\s.-]*betrag)?|brutto[\s.-]*endsumme|endsumme|insgesamt|bestellwert|gesamtsumme|gesamtbetrag|gesamtkosten(?:[\s.]*brutto)?|total|rechnungsbetrag|rechnungssumme|endbetrag|bestellbetrag|auftragssumme)[\s.:#-]*([0-9]{1,3}(?:[.\s][0-9]{3})*[,.][0-9]{2})\s*(?:€|eur|euro)/i,
      // "547,95 EUR" als Anker mit Schlüsselwort davor
      /(?:summe|betrag|brutto)[\s.:#-]*([0-9]{1,3}(?:[.\s][0-9]{3})*[,.][0-9]{2})/i,
    ];
    for (const re of betragPatterns) {
      const m = body.match(re);
      if (m && m[1]) {
        const normalized = m[1].replace(/[.\s]/g, "").replace(",", ".");
        const num = parseFloat(normalized);
        if (Number.isFinite(num) && num > 0 && num < 1_000_000) {
          bodyExtractedBetrag = num;
          logInfo("webhook/email", `Betrag-Body-Fallback gegriffen: ${num}€ aus "${m[0]}"`, { email_betreff });
          break;
        }
      }
    }
  }

  // ─── Kundennummer-Body-Fallback ──────────────────────────────────────
  // 15.05.2026 — Analog Betrag: wenn keine KI-Analyse einen kundennummer-Wert
  // geliefert hat, im Body nach Standard-Patterns suchen. Greift bei body-only
  // Mails wo KI typ='unbekannt' oder Felder nicht extrahiert hat (Bernstein etc.).
  let bodyExtractedKundennummer: string | null = null;
  if (!analyseErgebnisse.find((e) => e.analyse.kundennummer)?.analyse.kundennummer) {
    const body = `${email_betreff}\n${email_body}`;
    const kundennrPatterns: RegExp[] = [
      // "Kundennummer: 1380585" / "Kunden-Nr.: 12345" / "Kunden-ID: ABC-12345"
      // "Customer ID: 98765" / "Customer No.: 12345"
      // Format: 4-15 Zeichen alphanumerisch + Bindestriche, beginnend mit Ziffer
      // oder Buchstabe (vermeidet false-positive auf "Kundennummer ist wichtig")
      /(?:kunden(?:[-\s.])?(?:nummer|nr|id)|customer\s*(?:id|no|number|nr))[\s.:#-]*([A-Z0-9][A-Z0-9-]{3,14})\b/i,
    ];
    for (const re of kundennrPatterns) {
      const m = body.match(re);
      if (m && m[1]) {
        const value = m[1].toUpperCase();
        // Sanity: nicht reine Buchstaben + mindestens 3 Ziffern (Plausibilität)
        const digitCount = (value.match(/\d/g) || []).length;
        if (digitCount >= 3) {
          bodyExtractedKundennummer = value;
          logInfo("webhook/email", `Kundennummer-Body-Fallback gegriffen: "${value}" aus "${m[0]}"`, { email_betreff });
          break;
        }
      }
    }
  }

  // ─── Gutschrift-Body-Fallback ────────────────────────────────────────
  // 17.05.2026 — Defense-in-Depth Layer parallel zur KI-Detection: scannt
  // Subject + Body nach Trigger-Begriffen für Rückerstattung/Gutschrift.
  // Gefährlich falsche Positiv-Klassifikation als Zahlungsforderung kostet
  // theoretisch 1000€+ → Defense-in-Depth lohnt sich.
  let bodyExtractedIstGutschrift = false;
  {
    const body = `${email_betreff}\n${email_body}`;
    const gutschriftPatterns: RegExp[] = [
      /\br(?:ü|ue)ckerstattungsbetrag\b/i,
      /\bguthabenbetrag\b/i,
      /\bguthaben[\s.:]+in\s+h(?:ö|oe)he\s+von\b/i,
      /\bauszahlung\s+(?:des\s+)?guthabens?\b/i,
      /\berstattungsbetrag\b/i,
      /\br(?:ü|ue)ckzahlungsbetrag\b/i,
      /\bcredit\s+(?:note|memo)\b/i,
      // "Gutschrift Nr." oder "Gutschrift vom ..." als Dokument-Header
      /\bgutschrift(?:\s+(?:nr\.?|nummer|vom))/i,
    ];
    for (const re of gutschriftPatterns) {
      if (re.test(body)) {
        bodyExtractedIstGutschrift = true;
        logInfo("webhook/email", `Gutschrift-Body-Fallback gegriffen via Pattern ${re.source}`, { email_betreff });
        break;
      }
    }
  }

  return {
    erkannteBestellnummer,
    subjectExtraNummern,
    bodyExtractedBetrag,
    bodyExtractedKundennummer,
    bodyExtractedIstGutschrift,
  };
}
