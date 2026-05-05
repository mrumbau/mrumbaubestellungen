/**
 * Shopify Parser.
 *
 * Domains:
 *   - shopify.com         (Billing-Mails — relevant für Pipeline)
 *   - email.shopify.com   (Marketing — IRRELEVANT, muss ausgefiltert werden)
 *
 * DB-verifizierte Sender (2026-05-05):
 *   - billing@shopify.com         → Subject "Rechnung Apr 26, 2026 für Floorstore"
 *   - email@email.shopify.com     → Marketing ("Die perfekte Geschäftsidee finden")
 *
 * Bestellnummer (z.B. "521455110") ist im PDF, nicht im Subject.
 * Subject hat aber das Datum als Englisch-Format ("Apr 26, 2026") plus
 * den Shop-Namen ("für Floorstore" / "for ShopName").
 *
 * Konfidenz 0.7 — unter Threshold, KI-Merge.
 */

import type { DokumentAnalyse } from "@/lib/openai";
import type { VendorParser, VendorParseResult, VendorParserInput } from "./types";
import { stripHtmlToText } from "./utils";

const SHOPIFY_BILLING_DOMAINS = ["shopify.com"];

const MONAT_EN_TO_NUM: Record<string, string> = {
  jan: "01", january: "01",
  feb: "02", february: "02",
  mar: "03", march: "03", mär: "03",
  apr: "04", april: "04",
  may: "05", mai: "05",
  jun: "06", june: "06", juni: "06",
  jul: "07", july: "07", juli: "07",
  aug: "08", august: "08",
  sep: "09", september: "09",
  oct: "10", october: "10", okt: "10", oktober: "10",
  nov: "11", november: "11",
  dec: "12", december: "12", dez: "12", dezember: "12",
};

function matches(input: VendorParserInput): boolean {
  const domain = input.email_domain.toLowerCase();
  const sender = (input.email_absender || "").toLowerCase();

  // Marketing-Domain explizit ausschließen
  if (domain === "email.shopify.com" || domain.endsWith(".email.shopify.com")) return false;

  // Marketing-Sender (email@email.shopify.com) — falls Domain als shopify.com geparsed wird
  if (sender.startsWith("email@email.shopify")) return false;

  return SHOPIFY_BILLING_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
}

export const shopifyParser: VendorParser = {
  name: "shopify",
  version: "1.0.0",

  matches,

  async parse(input: VendorParserInput): Promise<VendorParseResult | null> {
    const subject = input.email_betreff || "";
    const plainBody = input.email_text || "";
    const htmlBody = input.email_html ? stripHtmlToText(input.email_html) : "";
    const searchSpace = `${subject}\n${plainBody}\n${htmlBody}`;

    // Subject muss "Rechnung" / "Invoice" enthalten
    if (!/rechnung|invoice|payment\s+receipt/i.test(subject)) {
      return null;
    }

    // Datum aus Subject — englischer Monat: "Apr 26, 2026" oder "April 26, 2026"
    let datum: string | null = null;
    const enMatch = subject.match(/([A-Za-zäöüÄÖÜ]{3,12})\s+(\d{1,2}),?\s+(20\d{2})/);
    if (enMatch) {
      const monatNum = MONAT_EN_TO_NUM[enMatch[1].toLowerCase()];
      if (monatNum) {
        datum = `${enMatch[3]}-${monatNum}-${enMatch[2].padStart(2, "0")}`;
      }
    }
    if (!datum) {
      const deMatch = searchSpace.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b/);
      if (deMatch) {
        const [, d, m, y] = deMatch;
        datum = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
    }

    // Shop-Name aus Subject ("für ShopName" / "for ShopName")
    let projekt_referenz: string | null = null;
    const shopMatch = subject.match(/(?:für|for)\s+([A-Za-zÄÖÜäöüß0-9 .&'-]{2,50}?)(?:\s*$|\s*[.,;])/i);
    if (shopMatch) projekt_referenz = shopMatch[1].trim();

    // Bestellnummer (Invoice Number) im Body
    let bestellnummer: string | null = null;
    const bnMatch = searchSpace.match(/\b(?:Invoice\s+Number|Rechnungsnummer|Invoice\s+#)[:\s]*(\d{6,12})\b/i);
    if (bnMatch) bestellnummer = bnMatch[1];

    const konfidenz = bestellnummer ? 0.8 : 0.7;

    const document: DokumentAnalyse = {
      typ: "rechnung",
      vermutete_bestellungsart: "abo",
      bestellnummer,
      auftragsnummer: null,
      lieferscheinnummer: null,
      haendler: "Shopify",
      datum,
      artikel: [],
      gesamtbetrag: null,
      netto: null,
      mwst: null,
      faelligkeitsdatum: null,
      lieferdatum: null,
      iban: null,
      konfidenz,
      lieferadressen: [],
      volltext: plainBody.slice(0, 5000),
      tracking_nummer: null,
      versanddienstleister: null,
      tracking_url: null,
      voraussichtliche_lieferung: null,
      kundennummer: null,
      besteller_im_dokument: null,
      projekt_referenz,
      bestelldatum: null,
    };

    return {
      vendor: "shopify",
      parser_version: shopifyParser.version,
      konfidenz,
      documents: [document],
    };
  },
};
