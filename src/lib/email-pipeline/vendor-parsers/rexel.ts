/**
 * Rexel Parser.
 *
 * Domain: rexel.de (DB-verifiziert 2026-05-05)
 * Sender: rechnung@rexel.de, Carola.Langer@rexel.de etc.
 * Subject-Patterns:
 *   "Rechnung 3310405"
 *   "Ihre Rechnung Nr. 3549364 vom 20.04.2026 - Kunden Nr. 9447944"
 *
 * Bestellnummer = Rechnungsnummer (7-stellige Ziffer).
 * Bei Subject mit "Kunden Nr." auch Kundennummer extrahierbar.
 *
 * Konfidenz 0.85 — Subject + RechnungsNr + Datum + KundenNr deterministisch.
 */

import type { DokumentAnalyse } from "@/lib/openai";
import type { VendorParser, VendorParseResult, VendorParserInput } from "./types";
import { stripHtmlToText } from "./utils";

const REXEL_DOMAINS = ["rexel.de", "rexel.com"];

function matches(input: VendorParserInput): boolean {
  const domain = input.email_domain.toLowerCase();
  return REXEL_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
}

export const rexelParser: VendorParser = {
  name: "rexel",
  version: "1.0.0",

  matches,

  async parse(input: VendorParserInput): Promise<VendorParseResult | null> {
    const subject = input.email_betreff || "";
    const plainBody = input.email_text || "";
    const htmlBody = input.email_html ? stripHtmlToText(input.email_html) : "";
    const searchSpace = `${subject}\n${plainBody}\n${htmlBody}`;

    if (/(?:newsletter|werbung|aktion|gutschein)/i.test(subject)) {
      return null;
    }

    // Rechnungsnummer aus Subject — zwei Patterns:
    //   "Rechnung 3310405"
    //   "Ihre Rechnung Nr. 3549364 vom ..."
    const rechnungMatch = subject.match(/Rechnung(?:\s+Nr\.?)?\s*(\d{6,9})/i);
    let bestellnummer: string | null = rechnungMatch?.[1] ?? null;

    if (!bestellnummer) {
      // Body-Fallback
      const bodyMatch = searchSpace.match(/Rechnung(?:\s+Nr\.?)?\s*(\d{6,9})/i);
      if (bodyMatch) bestellnummer = bodyMatch[1];
    }

    if (!bestellnummer) return null;

    // Kundennummer
    const kundenMatch = searchSpace.match(/Kunden(?:\s+Nr\.?|nummer)[:\s]*(\d{4,10})/i);
    const kundennummer = kundenMatch?.[1] ?? null;

    // Datum aus Subject "vom DD.MM.YYYY"
    let datum: string | null = null;
    const vomMatch = subject.match(/vom\s+(\d{1,2})\.(\d{1,2})\.(20\d{2})/i);
    if (vomMatch) {
      const [, d, m, y] = vomMatch;
      datum = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    } else {
      const deMatch = searchSpace.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/);
      if (deMatch) {
        const [, d, m, y] = deMatch;
        datum = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
    }

    const document: DokumentAnalyse = {
      typ: "rechnung",
      vermutete_bestellungsart: "material",
      bestellnummer,
      auftragsnummer: null,
      lieferscheinnummer: null,
      haendler: "Rexel Germany GmbH & Co. KG",
      datum,
      artikel: [],
      gesamtbetrag: null,
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
      kundennummer,
      besteller_im_dokument: null,
      projekt_referenz: null,
      bestelldatum: null,
    };

    return {
      vendor: "rexel",
      parser_version: rexelParser.version,
      konfidenz: 0.85,
      documents: [document],
    };
  },
};
