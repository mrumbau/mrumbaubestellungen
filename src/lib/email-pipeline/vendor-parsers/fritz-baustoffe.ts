/**
 * Fritz Baustoffe Parser.
 *
 * Sehr klare Subject-Patterns:
 *   "Fritz Baustoffe GmbH & Co.KG - RechNr: 02/8159078 vom 17.04.2026"
 *   "Fritz Baustoffe GmbH & Co.KG - RechNr: 02/8159077 vom 17.04.2026"
 *
 * Sender: Rechnungsausgang@f-b.gmbh
 */

import type { DokumentAnalyse } from "@/lib/openai";
import type { VendorParser, VendorParseResult, VendorParserInput } from "./types";
import { parseGermanDate, parseEuroAmount, stripHtmlToText } from "./utils";

const FRITZ_DOMAINS = ["f-b.gmbh", "fritz-baustoffe.de"];

function matches(input: VendorParserInput): boolean {
  const domain = input.email_domain.toLowerCase();
  if (FRITZ_DOMAINS.some((d) => domain === d || domain.endsWith("." + d))) return true;
  // Subject-Hint
  return /\bFritz\s+Baustoffe\b/i.test(input.email_betreff);
}

export const fritzBaustoffeParser: VendorParser = {
  name: "fritz-baustoffe",
  version: "1.0.0",

  matches,

  async parse(input: VendorParserInput): Promise<VendorParseResult | null> {
    const subject = input.email_betreff || "";
    const plainBody = input.email_text || "";
    const htmlBody = input.email_html ? stripHtmlToText(input.email_html) : "";
    const searchSpace = `${subject}\n${plainBody}\n${htmlBody}`;

    // Hauptnummer: "RechNr: 02/8159078"
    const rechnungMatch = searchSpace.match(/RechNr:?\s*([\d/-]+)/i);
    if (!rechnungMatch) {
      return null;
    }

    const rechnungsnummer = rechnungMatch[1];

    // Datum: "vom 17.04.2026"
    const datumMatch = searchSpace.match(/vom\s+(\d{1,2}\.\d{1,2}\.\d{4})/i);
    const datum = datumMatch ? parseGermanDate(datumMatch[1]) : null;

    // Beträge — bei Fritz oft nur im PDF
    const betragMatch =
      searchSpace.match(/(?:Brutto|Gesamtbetrag|Rechnungsbetrag|Endbetrag)[:\s]*([\d.,]+)\s*(?:€|EUR)?/i)
      ?? searchSpace.match(/Summe\s+brutto[:\s]*([\d.,]+)/i);
    const betrag = betragMatch ? parseEuroAmount(betragMatch[1]) : null;

    const document: DokumentAnalyse = {
      typ: "rechnung",
      vermutete_bestellungsart: "material",
      bestellnummer: rechnungsnummer,
      auftragsnummer: null,
      lieferscheinnummer: null,
      haendler: "Fritz Baustoffe GmbH & Co.KG",
      datum,
      artikel: [],
      gesamtbetrag: betrag,
      netto: null,
      mwst: null,
      faelligkeitsdatum: null,
      lieferdatum: null,
      iban: null,
      konfidenz: 0.85,
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
      vendor: "fritz-baustoffe",
      parser_version: fritzBaustoffeParser.version,
      konfidenz: 0.85,
      documents: [document],
    };
  },
};
