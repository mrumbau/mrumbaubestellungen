/**
 * FASP Finck & Partner Parser (Anwaltskanzlei — Spezialfall).
 *
 * Domain: fasp.de (DB-verifiziert 2026-05-05)
 * Sender: info@fasp.de, Krueger@fasp.de
 * Subject-Pattern: "MR Umbau GmbH ./. <Gegner> - Akte: <6-digit>-<2-digit>"
 *   z.B. "MR Umbau GmbH ./. von Nordenskjöld, Nana - Akte: 000211-26"
 *
 * Spezialfall: keine klassische Rechnung, sondern Klageschriften, Schriftsätze,
 * Gerichts-Korrespondenz. Aktenzeichen wird als Bestellnummer modelliert,
 * Doku-Typ ist "leistungsnachweis" (laut Memory-Konvention seit 04.05.2026).
 *
 * Konfidenz 0.8 — Aktenzeichen + Doku-Typ deterministisch aus Subject.
 */

import type { DokumentAnalyse } from "@/lib/openai";
import type { VendorParser, VendorParseResult, VendorParserInput } from "./types";
import { stripHtmlToText } from "./utils";

const FASP_DOMAINS = ["fasp.de"];

function matches(input: VendorParserInput): boolean {
  const domain = input.email_domain.toLowerCase();
  return FASP_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
}

export const faspParser: VendorParser = {
  name: "fasp",
  version: "1.0.0",

  matches,

  async parse(input: VendorParserInput): Promise<VendorParseResult | null> {
    const subject = input.email_betreff || "";
    const plainBody = input.email_text || "";
    const htmlBody = input.email_html ? stripHtmlToText(input.email_html) : "";
    const searchSpace = `${subject}\n${plainBody}\n${htmlBody}`;

    // Aktenzeichen-Pattern: "Akte: 000211-26" oder "Akte: 123456-26/RK/01/RK"
    const akteMatch = searchSpace.match(/Akte:\s*([A-Z0-9]{4,8}-\d{2}(?:\/[A-Z0-9/]+)?)/i);
    // Fallback: ohne "Akte:"-Präfix, z.B. nur "000211-26" im Subject
    const fallbackMatch = subject.match(/\b(\d{6}-\d{2}(?:\/[A-Z0-9/]+)?)\b/);
    const aktenzeichen = akteMatch?.[1] ?? fallbackMatch?.[1] ?? null;
    if (!aktenzeichen) return null;

    // Gegner extrahieren (zwischen "./." und "- Akte:")
    let projekt_referenz: string | null = null;
    const gegnerMatch = subject.match(/\.\/\.\s*([^-]+?)\s*-\s*Akte:/i);
    if (gegnerMatch) projekt_referenz = `MR Umbau ./. ${gegnerMatch[1].trim()}`;

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
      typ: "leistungsnachweis",
      vermutete_bestellungsart: "subunternehmer",
      bestellnummer: aktenzeichen,
      auftragsnummer: null,
      lieferscheinnummer: null,
      haendler: "FASP Finck & Partner",
      datum,
      artikel: [],
      gesamtbetrag: null,
      netto: null,
      mwst: null,
      faelligkeitsdatum: null,
      lieferdatum: null,
      iban: null,
      konfidenz: 0.8,
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
      vendor: "fasp",
      parser_version: faspParser.version,
      konfidenz: 0.8,
      documents: [document],
    };
  },
};
