/**
 * Microsoft 365 Parser.
 *
 * Domain: microsoft.com (DB-verifiziert 2026-05-05)
 * Sender: microsoft-noreply@microsoft.com
 * Subject (deutsch):
 *   "Rechnung für Microsoft 365 Business Standard einsehen"
 *
 * Bestellnummer ist im PDF (z.B. "E0100ZBO54"). Nicht im Subject extrahierbar.
 *
 * WICHTIG: Microsoft hat viele Service-Mails (Sicherheitswarnungen, Token-
 * Anmeldungen, Tenant-Updates). Match darf nur auf Rechnungs-/Billing-Subjects
 * reagieren, nicht auf alle Microsoft-Mails.
 *
 * Strategie: Anker für Plattform + bestellungsart="abo"; KI extrahiert
 * Rechnungsnummer + Beträge aus dem PDF.
 *
 * Konfidenz 0.6 — unter Threshold, KI-Merge gewollt.
 */

import type { DokumentAnalyse } from "@/lib/openai";
import type { VendorParser, VendorParseResult, VendorParserInput } from "./types";
import { stripHtmlToText } from "./utils";

type DokuTyp = DokumentAnalyse["typ"];

const MICROSOFT_DOMAINS = ["microsoft.com", "microsoftonline.com", "microsoft365.com"];

function matches(input: VendorParserInput): boolean {
  const domain = input.email_domain.toLowerCase();
  const matchesDomain = MICROSOFT_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
  if (!matchesDomain) return false;

  // Subject-Filter: nur Billing-/Rechnungs-Mails
  const subject = (input.email_betreff || "").toLowerCase();
  return /rechnung|invoice|billing|payment|zahlung|abrechnung/.test(subject)
    && /(microsoft|365|office|azure|teams)/.test(subject);
}

function inferTyp(subject: string): DokuTyp {
  const s = subject.toLowerCase();
  if (/rechnung|invoice/.test(s)) return "rechnung";
  if (/abrechnung/.test(s)) return "rechnung";
  return "rechnung"; // Match-Filter sichert dass es ein Billing-Subject ist
}

export const microsoftParser: VendorParser = {
  name: "microsoft",
  version: "1.0.0",

  matches,

  async parse(input: VendorParserInput): Promise<VendorParseResult | null> {
    const subject = input.email_betreff || "";
    const plainBody = input.email_text || "";
    const htmlBody = input.email_html ? stripHtmlToText(input.email_html) : "";
    const searchSpace = `${subject}\n${plainBody}\n${htmlBody}`;

    const typ = inferTyp(subject);

    // Microsoft-Rechnungsnummer-Pattern: alphanumerisch, beginnt mit Buchstaben
    // (z.B. "E0100ZBO54", "G123456789"). Subject enthält sie selten.
    let bestellnummer: string | null = null;
    const bnMatch = searchSpace.match(/\b(?:Rechnungsnummer|Invoice\s+Number|Invoice)[:\s#-]+([A-Z][A-Z0-9]{6,12})\b/i);
    if (bnMatch) bestellnummer = bnMatch[1].toUpperCase();

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

    // Service-Variante aus Subject
    let haendler = "Microsoft";
    if (/azure/i.test(subject)) haendler = "Microsoft Azure";
    else if (/365\s+business|office\s+365/i.test(subject)) haendler = "Microsoft 365 Business";
    else if (/teams/i.test(subject)) haendler = "Microsoft Teams";

    const konfidenz = bestellnummer ? 0.78 : 0.6;

    const document: DokumentAnalyse = {
      typ,
      vermutete_bestellungsart: "abo",
      bestellnummer,
      auftragsnummer: null,
      lieferscheinnummer: null,
      haendler,
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
      projekt_referenz: null,
      bestelldatum: null,
    };

    return {
      vendor: "microsoft",
      parser_version: microsoftParser.version,
      konfidenz,
      documents: [document],
    };
  },
};
