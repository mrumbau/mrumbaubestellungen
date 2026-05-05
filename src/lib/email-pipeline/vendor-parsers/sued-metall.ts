/**
 * Süd-Metall Parser.
 *
 * Süd-Metall ist Stahlhandel/Metall-Bau-Lieferant. Subject-Pattern:
 *   "Süd-Metall AUF1234567 Kd-Nr.: 654321"
 *   "Süd-Metall Auftragsbestätigung AUF1234567 ..."
 *   "Rechnung RE-12345 zu Auftrag AUF1234567 ..."
 *
 * Bestellnummer-Pattern: `AUF\d{7}` (z.B. AUF1234567)
 * Kundennummer-Pattern: `Kd-Nr\.?:?\s*(\d+)`
 *
 * Domains (laut Backfill-Daten 14.04.-28.04.):
 *   - sued-metall.de
 *   - suedmetall.com
 *   - sued-metall.com
 *
 * Konfidenz 0.82: Subject-Match ist eindeutig (AUF-Nummer im Subject),
 * Beträge bleiben im PDF — KI ergänzt.
 */

import type { DokumentAnalyse } from "@/lib/openai";
import type { VendorParser, VendorParseResult, VendorParserInput } from "./types";
import { stripHtmlToText } from "./utils";

type DokuTyp = DokumentAnalyse["typ"];

const SUED_METALL_DOMAINS = [
  "sued-metall.de",
  "suedmetall.com",
  "sued-metall.com",
  "sued-metall.eu",
];

function matches(input: VendorParserInput): boolean {
  const domain = input.email_domain.toLowerCase();
  const matchesDomain = SUED_METALL_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
  if (matchesDomain) return true;

  // Domain-Fallback: Subject muss "Süd-Metall" enthalten und AUF-Pattern
  const subject = (input.email_betreff || "").toLowerCase();
  return /süd[\s-]?metall/.test(subject) && /auf\d{7}/i.test(subject);
}

function inferTyp(subject: string, body: string): DokuTyp {
  const s = `${subject} ${body}`.toLowerCase();
  if (/auftragsbestätigung|auftragsbestaetigung|bestellbestätigung|bestellbestaetigung/.test(s)) {
    return "bestellbestaetigung";
  }
  if (/rechnung|invoice/.test(s)) return "rechnung";
  if (/lieferschein/.test(s)) return "lieferschein";
  if (/versand|sendung\s+unterwegs|verschickt/.test(s)) return "versandbestaetigung";
  return "bestellbestaetigung"; // AUF-Nummer im Subject deutet meist auf Auftragsbestätigung
}

export const suedMetallParser: VendorParser = {
  name: "sued-metall",
  version: "1.0.0",

  matches,

  async parse(input: VendorParserInput): Promise<VendorParseResult | null> {
    const subject = input.email_betreff || "";
    const plainBody = input.email_text || "";
    const htmlBody = input.email_html ? stripHtmlToText(input.email_html) : "";
    const searchSpace = `${subject}\n${plainBody}\n${htmlBody}`;

    // Marketing-Mails ausfiltern
    if (/(?:newsletter|werbung|angebot\s+der\s+woche|sonderaktion)/i.test(subject)) {
      return null;
    }

    // AUF-Nummer (Auftragsnummer + Bestellnummer in einem)
    const aufMatch = searchSpace.match(/\b(AUF\d{7})\b/i);
    if (!aufMatch) return null;
    const aufNummer = aufMatch[1].toUpperCase();

    // Rechnungsnummer falls Rechnung — Pattern "RE-XXXXX" oder "Rechnung Nr. XXXXX"
    const rechnungMatch = searchSpace.match(/\bRE[-_]?(\d{4,8})\b/i)
      || searchSpace.match(/Rechnung[\s-]+Nr\.?\s*(\d{4,8})/i);
    const rechnungsnummer = rechnungMatch?.[1] ? `RE-${rechnungMatch[1]}` : null;

    // Kundennummer
    const kundenMatch = searchSpace.match(/Kd[\s-]?Nr\.?:?\s*(\d{4,8})/i)
      || searchSpace.match(/Kundennummer:?\s*(\d{4,8})/i);
    const kundennummer = kundenMatch?.[1] ?? null;

    // Lieferscheinnummer falls Lieferschein
    const lieferscheinMatch = searchSpace.match(/Lieferschein[\s-]?Nr\.?:?\s*(\d{4,10})/i)
      || searchSpace.match(/\bLS[-_]?(\d{4,10})\b/i);
    const lieferscheinnummer = lieferscheinMatch?.[1]
      ? (lieferscheinMatch[0].startsWith("LS") ? `LS-${lieferscheinMatch[1]}` : lieferscheinMatch[1])
      : null;

    const typ = inferTyp(subject, plainBody);

    // Hauptnummer: bei Rechnung die Rechnungsnummer, sonst AUF-Nummer
    const bestellnummer = typ === "rechnung" && rechnungsnummer ? rechnungsnummer : aufNummer;

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

    const document: DokumentAnalyse = {
      typ,
      vermutete_bestellungsart: "material",
      bestellnummer,
      auftragsnummer: aufNummer,
      lieferscheinnummer,
      haendler: "Süd-Metall",
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
      tracking_nummer: null,
      versanddienstleister: null,
      tracking_url: null,
      voraussichtliche_lieferung: null,
      kundennummer,
      besteller_im_dokument: null,
      projekt_referenz: null,
      bestelldatum: typ === "bestellbestaetigung" ? datum : null,
    };

    return {
      vendor: "sued-metall",
      parser_version: suedMetallParser.version,
      konfidenz: 0.82,
      documents: [document],
    };
  },
};
