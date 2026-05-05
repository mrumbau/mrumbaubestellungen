/**
 * DeubaXXL Parser.
 *
 * DeubaXXL ist B2C-Shop für Garten/Möbel/Bau. Subject-Pattern:
 *   "Deine Bestellung 1234567 wurde bestätigt"
 *   "Deine Rechnung zur Bestellung 1234567"
 *   "Versandbestätigung zu deiner Bestellung 1234567"
 *
 * Sender: noreply@deubaxxl.de / service@deubaxxl.de
 *
 * Bestellnummer-Pattern: 6-9 stellige Ziffer, im Subject nach "Bestellung"
 *
 * Bisher teilweise vom generischen "Possessive-Pattern" in run.ts abgedeckt
 * (`(Deine|Ihre) Bestellung XXXXXXX`). Vendor-Parser ist robuster (Doku-Typ-
 * Erkennung, Tracking-Extraktion bei Versand-Mails).
 *
 * Konfidenz 0.82.
 */

import type { DokumentAnalyse } from "@/lib/openai";
import type { VendorParser, VendorParseResult, VendorParserInput } from "./types";
import { stripHtmlToText } from "./utils";

type DokuTyp = DokumentAnalyse["typ"];

const DEUBAXXL_DOMAINS = ["deubaxxl.de", "deuba.com", "deubaxxl.com"];

function matches(input: VendorParserInput): boolean {
  const domain = input.email_domain.toLowerCase();
  return DEUBAXXL_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
}

function inferTyp(subject: string): DokuTyp {
  const s = subject.toLowerCase();
  if (/rechnung|invoice/.test(s)) return "rechnung";
  if (/versand|sendung|verschickt|unterwegs|tracking/.test(s)) return "versandbestaetigung";
  if (/bestellung\s+(eingegangen|bestätigt|aufgegeben)|bestellbestätigung|bestellbestaetigung/.test(s)) {
    return "bestellbestaetigung";
  }
  if (/lieferschein/.test(s)) return "lieferschein";
  return "bestellbestaetigung";
}

export const deubaxxlParser: VendorParser = {
  name: "deubaxxl",
  version: "1.0.0",

  matches,

  async parse(input: VendorParserInput): Promise<VendorParseResult | null> {
    const subject = input.email_betreff || "";
    const plainBody = input.email_text || "";
    const htmlBody = input.email_html ? stripHtmlToText(input.email_html) : "";
    const searchSpace = `${subject}\n${plainBody}\n${htmlBody}`;

    // Marketing/Newsletter ausfiltern
    if (/(?:newsletter|gutschein|sale|deal\s+der|werbung|angebot)/i.test(subject)) {
      return null;
    }

    // Bestellnummer: Subject hat Vorrang ("Deine/Ihre Bestellung XXXXXXX")
    let bestellnummer: string | null = null;
    const subjectMatch = subject.match(/(?:Deine|Ihre)\s+Bestellung\s+(\d{6,9})/i)
      || subject.match(/Bestellung[\s:#-]*(\d{6,9})/i);
    if (subjectMatch) {
      bestellnummer = subjectMatch[1];
    } else {
      // Body-Fallback
      const bodyMatch = searchSpace.match(/Bestellnummer[:\s#-]*(\d{6,9})/i)
        || searchSpace.match(/(?:Deine|Ihre)\s+Bestellung[:\s#-]+(\d{6,9})/i);
      if (bodyMatch) bestellnummer = bodyMatch[1];
    }

    if (!bestellnummer) return null;

    const typ = inferTyp(subject);

    // Datum
    let datum: string | null = null;
    const isoMatch = searchSpace.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (isoMatch) {
      datum = isoMatch[1];
    } else {
      const deMatch = searchSpace.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/);
      if (deMatch) {
        const [, d, m, y] = deMatch;
        datum = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
    }

    // Versand-Mails: Tracking extrahieren
    let tracking_nummer: string | null = null;
    let tracking_url: string | null = null;
    let versanddienstleister: string | null = null;
    if (typ === "versandbestaetigung") {
      const urlMatch = searchSpace.match(/(https?:\/\/[^\s<>"]*(?:tracking|sendung|track|nolp\.dhl)[^\s<>"]*)/i);
      if (urlMatch) tracking_url = urlMatch[1];

      // DHL-Tracking-Nummer (12-20 digits) — nur falls "DHL" im Text vorkommt
      if (/\bDHL\b/i.test(searchSpace)) {
        const dhlMatch = searchSpace.match(/\b(\d{12,20})\b/);
        if (dhlMatch) {
          tracking_nummer = dhlMatch[1];
          versanddienstleister = "DHL";
        }
      } else if (/\bDPD\b/i.test(searchSpace)) {
        const dpdMatch = searchSpace.match(/\b(\d{14,15})\b/);
        if (dpdMatch) {
          tracking_nummer = dpdMatch[1];
          versanddienstleister = "DPD";
        }
      } else if (/\bGLS\b/i.test(searchSpace)) {
        versanddienstleister = "GLS";
      }
    }

    const document: DokumentAnalyse = {
      typ,
      vermutete_bestellungsart: "material",
      bestellnummer,
      auftragsnummer: null,
      lieferscheinnummer: null,
      haendler: "DeubaXXL",
      datum,
      artikel: [],
      gesamtbetrag: null,
      netto: null,
      mwst: null,
      faelligkeitsdatum: null,
      lieferdatum: null,
      iban: null,
      konfidenz: 0.82,
      lieferadressen: [],
      volltext: plainBody.slice(0, 5000),
      tracking_nummer,
      versanddienstleister,
      tracking_url,
      voraussichtliche_lieferung: null,
      kundennummer: null,
      besteller_im_dokument: null,
      projekt_referenz: null,
      bestelldatum: typ === "bestellbestaetigung" ? datum : null,
    };

    return {
      vendor: "deubaxxl",
      parser_version: deubaxxlParser.version,
      konfidenz: 0.82,
      documents: [document],
    };
  },
};
