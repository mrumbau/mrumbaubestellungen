/**
 * Telekom Parser.
 *
 * Telekom-Geschäftskunden-Rechnungen kommen monatlich:
 *   Subject: "Telekom Mobilfunk-Rechnung für Geschäftskunden März 2026"
 *   Subject: "Telekom Festnetz-Rechnung für Geschäftskunden Februar 2026"
 *   Sender:  kundenservice-rechnungonline@telekom.de
 *
 * Anhang: PDF, Filename meist "Rechnung_<RechnungsNr>_<Datum>.pdf"
 * Rechnungsnummer meist nicht im Subject — entweder Filename oder Body.
 *
 * Bestellungsart: "abo" (Telekommunikations-Vertrag, monatlich)
 *
 * Konfidenz konservativ 0.78: Subject-Match ist eindeutig, aber Beträge
 * sitzen im PDF — KI würde die ergänzen, Vendor liefert nur Skelett.
 */

import type { DokumentAnalyse } from "@/lib/openai";
import type { VendorParser, VendorParseResult, VendorParserInput } from "./types";
import { stripHtmlToText } from "./utils";

const TELEKOM_DOMAINS = ["telekom.de"];

const MONAT_DE_TO_NUM: Record<string, string> = {
  januar: "01", februar: "02", märz: "03", maerz: "03", april: "04",
  mai: "05", juni: "06", juli: "07", august: "08",
  september: "09", oktober: "10", november: "11", dezember: "12",
};

function matches(input: VendorParserInput): boolean {
  const domain = input.email_domain.toLowerCase();
  const matchesDomain = TELEKOM_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
  if (!matchesDomain) return false;

  // Zusätzliches Subject-Hint, damit Marketing-Mails ausgefiltert werden
  const subject = (input.email_betreff || "").toLowerCase();
  return /telekom.*rechnung/.test(subject) || /rechnung.*geschäftskunden/i.test(subject);
}

export const telekomParser: VendorParser = {
  name: "telekom",
  version: "1.0.0",

  matches,

  async parse(input: VendorParserInput): Promise<VendorParseResult | null> {
    const subject = input.email_betreff || "";
    const plainBody = input.email_text || "";
    const htmlBody = input.email_html ? stripHtmlToText(input.email_html) : "";
    const searchSpace = `${subject}\n${plainBody}\n${htmlBody}`;

    // Mahnungen / Inkasso-Mails: KI soll übernehmen
    if (/\b(Mahnung|Inkasso|Zahlungserinnerung)\b/i.test(subject)) {
      return null;
    }

    // Rechnungsnummer-Extraktion (mehrstufig)
    let rechnungsnummer: string | null = null;

    // 1) Aus PDF-Filename — z.B. "Rechnung_123456789012_20260315.pdf"
    const pdfAnhang = input.anhaenge.find((a) => a.mime_type === "application/pdf");
    if (pdfAnhang) {
      const fileMatch = pdfAnhang.name.match(/Rechnung[_-]?(\d{8,14})/i);
      if (fileMatch) rechnungsnummer = fileMatch[1];
    }

    // 2) Aus Body — "Rechnungsnummer 123456789012" / "Rechnung Nr. ..."
    if (!rechnungsnummer) {
      const bodyMatch = searchSpace.match(/Rechnungsnummer[:\s]+(\d{8,14})/i)
        || searchSpace.match(/Rechnung[\s-]+Nr\.?[:\s]*(\d{8,14})/i);
      if (bodyMatch) rechnungsnummer = bodyMatch[1];
    }

    // Ohne Rechnungsnummer → KI muss übernehmen
    if (!rechnungsnummer) return null;

    // Kundennummer (Telekom: 8-12 Digits, "Buchungskonto" oder "Kundennummer")
    const kundennummerMatch = searchSpace.match(/(?:Buchungskonto|Kundennummer)[:\s]+(\d{8,12})/i);
    const kundennummer = kundennummerMatch?.[1] ?? null;

    // Periode (Monat + Jahr) aus Subject — als Bestelldatum-Hint
    let datum: string | null = null;
    const periodeMatch = subject.match(/(Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i);
    if (periodeMatch) {
      const monat = MONAT_DE_TO_NUM[periodeMatch[1].toLowerCase()];
      const jahr = periodeMatch[2];
      if (monat) {
        // Telekom-Rechnungen tragen typisch das Datum am Monatsende der Periode
        datum = `${jahr}-${monat}-01`;
      }
    }

    // Datum aus Filename (überschreibt Subject-Periode wenn präziser)
    if (pdfAnhang) {
      const fileDate = pdfAnhang.name.match(/(20\d{2})(\d{2})(\d{2})/);
      if (fileDate) datum = `${fileDate[1]}-${fileDate[2]}-${fileDate[3]}`;
    }

    // Service-Variante (Mobilfunk / Festnetz / Kombi) als Händler-Suffix
    let serviceVariante = "Telekom Deutschland GmbH";
    if (/Mobilfunk/i.test(subject)) serviceVariante = "Telekom Deutschland GmbH (Mobilfunk)";
    else if (/Festnetz/i.test(subject)) serviceVariante = "Telekom Deutschland GmbH (Festnetz)";

    const document: DokumentAnalyse = {
      typ: "rechnung",
      vermutete_bestellungsart: "abo",
      bestellnummer: rechnungsnummer,
      auftragsnummer: null,
      lieferscheinnummer: null,
      haendler: serviceVariante,
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
      kundennummer,
      besteller_im_dokument: null,
      projekt_referenz: null,
      bestelldatum: datum,
    };

    return {
      vendor: "telekom",
      parser_version: telekomParser.version,
      konfidenz: 0.78,
      documents: [document],
    };
  },
};
