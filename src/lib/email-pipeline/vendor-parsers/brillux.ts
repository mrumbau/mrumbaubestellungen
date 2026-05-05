/**
 * Brillux Parser.
 *
 * Brillux verwendet sehr klare Subject-Patterns:
 *   "Brillux Rechnung, Kundennummer 4147622, Rechnung Nr. 6887860"
 *   "Brillux Rechnung, Kundennummer 4147622, Rechnung Nr. 6901587"
 *
 * Sender: Fakturaversand_gs_01@brillux.de (Faktura) / fm@brillux.de (Mahnung)
 *
 * Anhang: PDF mit Rechnungsnummer im Filename, z.B. "RE-6887860-20260420-4147622.pdf"
 */

import type { DokumentAnalyse } from "@/lib/openai";
import type { VendorParser, VendorParseResult, VendorParserInput } from "./types";
import { parseGermanDate, parseEuroAmount, stripHtmlToText } from "./utils";

const BRILLUX_DOMAINS = ["brillux.de"];

function matches(input: VendorParserInput): boolean {
  const domain = input.email_domain.toLowerCase();
  return BRILLUX_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
}

export const brilluxParser: VendorParser = {
  name: "brillux",
  version: "1.0.0",

  matches,

  async parse(input: VendorParserInput): Promise<VendorParseResult | null> {
    const subject = input.email_betreff || "";
    const plainBody = input.email_text || "";
    const htmlBody = input.email_html ? stripHtmlToText(input.email_html) : "";
    const searchSpace = `${subject}\n${plainBody}\n${htmlBody}`;

    // Mahnung-Erkennung — Subject "Mahnung" / Sender fm@
    const istMahnung = /\bMahnung\b/i.test(subject) || input.email_absender.toLowerCase().startsWith("fm@");
    if (istMahnung) {
      // Mahnungen haben kein Standard-Doku-Schema, KI soll übernehmen
      return null;
    }

    // Hauptnummer: Rechnung Nr. XXXXXXX (6-8 Digits)
    const rechnungMatch = searchSpace.match(/Rechnung\s+Nr\.\s*(\d{6,8})/i);
    const kundennummerMatch = searchSpace.match(/Kundennummer\s+(\d{6,10})/i);

    if (!rechnungMatch) {
      return null;
    }

    const rechnungsnummer = rechnungMatch[1];
    const kundennummer = kundennummerMatch?.[1] ?? null;

    // Datum aus Anhang-Filename ableiten falls vorhanden ("RE-XXX-YYYYMMDD-XXX.pdf")
    let datum: string | null = null;
    const pdfAnhang = input.anhaenge.find((a) => a.mime_type === "application/pdf");
    if (pdfAnhang) {
      const dateMatch = pdfAnhang.name.match(/(\d{4})(\d{2})(\d{2})/);
      if (dateMatch) {
        datum = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
      }
    }
    // Fallback: Datum aus Body
    if (!datum) {
      const bodyDate = searchSpace.match(/(\d{1,2}\.\d{1,2}\.\d{4})/);
      if (bodyDate) datum = parseGermanDate(bodyDate[1]);
    }

    // Beträge — bei Brillux meist nur im PDF, hier nur Body-Heuristik
    const betragMatch = searchSpace.match(/(?:Brutto|Gesamtbetrag|Rechnungsbetrag)[:\s]*([\d.,]+)\s*(?:€|EUR)?/i);
    const betrag = betragMatch ? parseEuroAmount(betragMatch[1]) : null;

    const document: DokumentAnalyse = {
      typ: "rechnung",
      vermutete_bestellungsart: "material",
      bestellnummer: rechnungsnummer,
      auftragsnummer: null,
      lieferscheinnummer: null,
      haendler: "Brillux GmbH & Co. KG",
      datum,
      artikel: [],
      gesamtbetrag: betrag,
      netto: null,
      mwst: null,
      faelligkeitsdatum: null,
      lieferdatum: null,
      iban: null,
      konfidenz: 0.85, // Subject-Match ist eindeutig, Beträge oft im PDF
      lieferadressen: [],
      volltext: plainBody.slice(0, 5000),
      tracking_nummer: null,
      versanddienstleister: null,
      tracking_url: null,
      voraussichtliche_lieferung: null,
      kundennummer,
      besteller_im_dokument: null,
      projekt_referenz: null,
      bestelldatum: null,
    };

    return {
      vendor: "brillux",
      parser_version: brilluxParser.version,
      konfidenz: 0.85,
      documents: [document],
    };
  },
};
