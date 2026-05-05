/**
 * Megabad Parser.
 *
 * Megabad ist Sanitär/Bad-Online-Shop. Subject-Pattern variiert:
 *   "Bestellbestätigung 81218020"
 *   "Rechnung zu Ihrer Bestellung 81218020"
 *   "Ihre Sendung 81218020 ist unterwegs"
 *
 * Sender:
 *   - warenausgang@megabad.de  (Versandbestätigung, ggf. Rechnung)
 *   - info@megabad.de          (Bestellbestätigung)
 *   - noreply@megabad.de
 *
 * Bestellnummer-Pattern: 8-stellige Ziffer (typisch 8121xxxx).
 * Sender-driven Doku-Typ-Hint:
 *   - warenausgang@ → Versand-/Rechnung-Pfad
 *   - info@         → Bestellbestätigung-Pfad
 *
 * Konfidenz 0.82.
 */

import type { DokumentAnalyse } from "@/lib/openai";
import type { VendorParser, VendorParseResult, VendorParserInput } from "./types";
import { stripHtmlToText } from "./utils";

type DokuTyp = DokumentAnalyse["typ"];

const MEGABAD_DOMAINS = ["megabad.de", "megabad.com"];

function matches(input: VendorParserInput): boolean {
  const domain = input.email_domain.toLowerCase();
  return MEGABAD_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
}

function inferTyp(subject: string, sender: string): DokuTyp {
  const s = subject.toLowerCase();
  if (/rechnung|invoice/.test(s)) return "rechnung";
  if (/versand|sendung|unterwegs|verschickt|tracking/.test(s)) return "versandbestaetigung";
  if (/lieferschein/.test(s)) return "lieferschein";
  if (/bestellbestätigung|bestellbestaetigung|bestellung\s+(eingegangen|aufgegeben|bestätigt)/.test(s)) {
    return "bestellbestaetigung";
  }
  // Sender-Heuristik wenn Subject unklar
  const senderLower = sender.toLowerCase();
  if (senderLower.startsWith("warenausgang@")) return "versandbestaetigung";
  if (senderLower.startsWith("info@")) return "bestellbestaetigung";
  return "unbekannt";
}

export const megabadParser: VendorParser = {
  name: "megabad",
  version: "1.0.0",

  matches,

  async parse(input: VendorParserInput): Promise<VendorParseResult | null> {
    const subject = input.email_betreff || "";
    const plainBody = input.email_text || "";
    const htmlBody = input.email_html ? stripHtmlToText(input.email_html) : "";
    const searchSpace = `${subject}\n${plainBody}\n${htmlBody}`;

    // Marketing/Newsletter ausfiltern
    if (/(?:newsletter|gutschein|aktion|sale|prozent|rabatt)/i.test(subject)) {
      return null;
    }

    // Bestellnummer: 8-stellige Ziffer, Subject hat Vorrang
    let bestellnummer: string | null = null;
    const subjectMatch = subject.match(/(?:Bestellung|Bestellnummer|Sendung|Auftrag)[:\s#-]*(\d{7,9})/i)
      || subject.match(/\b(8\d{7})\b/); // Megabad-typisch beginnt mit 8
    if (subjectMatch) {
      bestellnummer = subjectMatch[1];
    } else {
      const bodyMatch = searchSpace.match(/Bestellnummer[:\s#-]*(\d{7,9})/i)
        || searchSpace.match(/Auftragsnummer[:\s#-]*(\d{7,9})/i);
      if (bodyMatch) bestellnummer = bodyMatch[1];
    }

    if (!bestellnummer) return null;

    const typ = inferTyp(subject, input.email_absender);

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

    // Tracking bei Versand
    let tracking_nummer: string | null = null;
    let tracking_url: string | null = null;
    let versanddienstleister: string | null = null;
    if (typ === "versandbestaetigung") {
      const urlMatch = searchSpace.match(/(https?:\/\/[^\s<>"]*(?:tracking|sendung|track|nolp\.dhl)[^\s<>"]*)/i);
      if (urlMatch) tracking_url = urlMatch[1];
      if (/\bDHL\b/i.test(searchSpace)) {
        const dhlMatch = searchSpace.match(/\b(\d{12,20})\b/);
        if (dhlMatch && dhlMatch[1] !== bestellnummer) {
          tracking_nummer = dhlMatch[1];
          versanddienstleister = "DHL";
        }
      } else if (/\bDPD\b/i.test(searchSpace)) {
        versanddienstleister = "DPD";
      } else if (/Spedition/i.test(searchSpace)) {
        versanddienstleister = "Spedition";
      }
    }

    const document: DokumentAnalyse = {
      typ,
      vermutete_bestellungsart: "material",
      bestellnummer,
      auftragsnummer: null,
      lieferscheinnummer: null,
      haendler: "Megabad",
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
      vendor: "megabad",
      parser_version: megabadParser.version,
      konfidenz: 0.82,
      documents: [document],
    };
  },
};
