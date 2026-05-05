/**
 * Hamdi Muhameti Fliesenleger Parser (Subunternehmer).
 *
 * Domain: hmfliesenleger.de (DB-verifiziert 2026-05-05)
 * Sender: info@hmfliesenleger.de
 * Subject-Pattern: "Rechnung <RE-Nr> <Jahr>" oder "Re: Rechnung <RE-Nr> <Jahr>"
 *   z.B. "Rechnung 12 2026"  → RE012 (Rechnung Nr. 12, Jahr 2026)
 *        "Re: Rechnung 12 2026" (Reply auf gleiche Mail)
 *
 * Bestellnummer-Format laut Memory: `RE\d{3,5}` (mit RE-Prefix + 3-5 digits).
 * Reply-Mails (Re:) treffen denselben RE-Code, sind also Idempotenz-relevant
 * (gleiche bestellnummer → claimMessage matcht).
 *
 * Konfidenz 0.78 — RE-Code aus Subject deterministisch ableitbar; Beträge im PDF.
 */

import type { DokumentAnalyse } from "@/lib/openai";
import type { VendorParser, VendorParseResult, VendorParserInput } from "./types";
import { stripHtmlToText } from "./utils";

const HMF_DOMAINS = ["hmfliesenleger.de", "hmfliesen.de"];

function matches(input: VendorParserInput): boolean {
  const domain = input.email_domain.toLowerCase();
  return HMF_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
}

export const hamdiMuhametiParser: VendorParser = {
  name: "hamdi-muhameti",
  version: "1.0.0",

  matches,

  async parse(input: VendorParserInput): Promise<VendorParseResult | null> {
    const subject = input.email_betreff || "";
    const plainBody = input.email_text || "";
    const htmlBody = input.email_html ? stripHtmlToText(input.email_html) : "";
    const searchSpace = `${subject}\n${plainBody}\n${htmlBody}`;

    // Subject muss "Rechnung" enthalten (auch nach Reply-Prefix "Re:")
    if (!/rechnung/i.test(subject)) {
      // Mails ohne "Rechnung" im Subject sind vermutlich Korrespondenz/Aufmaß —
      // lieber an KI delegieren.
      return null;
    }

    // RE-Nummer-Pattern: "Rechnung 12 2026" → RE012 (zero-padded auf 3)
    let bestellnummer: string | null = null;
    const subjectMatch = subject.match(/Rechnung\s+(\d{1,5})\s+(20\d{2})/i);
    if (subjectMatch) {
      const reNr = subjectMatch[1].padStart(3, "0");
      bestellnummer = `RE${reNr}`;
    } else {
      // Fallback: "RE\d{3,5}" direkt im Subject/Body
      const directMatch = searchSpace.match(/\b(RE\d{3,5})\b/i);
      if (directMatch) bestellnummer = directMatch[1].toUpperCase();
    }

    if (!bestellnummer) return null;

    // Datum: bei "Rechnung 12 2026" ist 2026 das Jahr; Tag/Monat aus Body falls vorhanden
    let datum: string | null = null;
    const yearMatch = subject.match(/(20\d{2})/);
    const isoMatch = searchSpace.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (isoMatch) {
      datum = isoMatch[1];
    } else {
      const deMatch = searchSpace.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/);
      if (deMatch) {
        const [, d, m, y] = deMatch;
        datum = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      } else if (yearMatch) {
        // Nur Jahr bekannt → 1. Januar als Platzhalter
        datum = `${yearMatch[1]}-01-01`;
      }
    }

    const document: DokumentAnalyse = {
      typ: "rechnung",
      vermutete_bestellungsart: "subunternehmer",
      bestellnummer,
      auftragsnummer: null,
      lieferscheinnummer: null,
      haendler: "Hamdi Muhameti Fliesenleger",
      datum,
      artikel: [],
      gesamtbetrag: null,
      netto: null,
      mwst: null,
      faelligkeitsdatum: null,
      lieferdatum: null,
      iban: null,
      konfidenz: 0.78,
      lieferadressen: [],
      volltext: plainBody.slice(0, 5000),
      tracking_nummer: null,
      versanddienstleister: null,
      tracking_url: null,
      voraussichtliche_lieferung: null,
      kundennummer: null,
      besteller_im_dokument: null,
      projekt_referenz: null,
      bestelldatum: null,
    };

    return {
      vendor: "hamdi-muhameti",
      parser_version: hamdiMuhametiParser.version,
      konfidenz: 0.78,
      documents: [document],
    };
  },
};
