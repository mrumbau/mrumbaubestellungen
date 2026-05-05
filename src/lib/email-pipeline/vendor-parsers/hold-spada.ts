/**
 * Hold & Spada Parser (Subunternehmer).
 *
 * Domain: hold-spada.com (verifiziert via DB-Query 2026-05-05)
 * Subject-Pattern: "<8-digit-Bestellnr>, DD.MM.YYYY, Mailversand"
 *   z.B. "26405829, 04.05.2026, Mailversand"
 *        "26406235, 04.05.2026, Mailversand"
 *
 * Sender: <person>@hold-spada.com (z.B. tanja.santl@hold-spada.com)
 *
 * Doku-Typ-Hinweis: das suffix "Mailversand" deutet auf den Versand der
 * Bestellbestätigung hin (Standard-Output der Hold-&-Spada-ERP-Software).
 * Der eigentliche Doku-Typ steht im PDF-Anhang — KI klassifiziert das.
 *
 * Konfidenz 0.82: Subject + Datum + Bestellnummer deterministisch
 * extrahierbar; Beträge im PDF.
 */

import type { DokumentAnalyse } from "@/lib/openai";
import type { VendorParser, VendorParseResult, VendorParserInput } from "./types";
import { stripHtmlToText } from "./utils";

type DokuTyp = DokumentAnalyse["typ"];

const HOLD_SPADA_DOMAINS = ["hold-spada.com", "hold-spada.de"];

function matches(input: VendorParserInput): boolean {
  const domain = input.email_domain.toLowerCase();
  return HOLD_SPADA_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
}

function inferTyp(subject: string, body: string): DokuTyp {
  const s = `${subject} ${body}`.toLowerCase();
  if (/rechnung|invoice/.test(s)) return "rechnung";
  if (/lieferschein/.test(s)) return "lieferschein";
  if (/aufmaß|aufmass/.test(s)) return "aufmass";
  if (/leistungsnachweis|stundenzettel/.test(s)) return "leistungsnachweis";
  // "Mailversand"-Suffix oder kein Hint → Bestellbestätigung als Default
  return "bestellbestaetigung";
}

export const holdSpadaParser: VendorParser = {
  name: "hold-spada",
  version: "1.0.0",

  matches,

  async parse(input: VendorParserInput): Promise<VendorParseResult | null> {
    const subject = input.email_betreff || "";
    const plainBody = input.email_text || "";
    const htmlBody = input.email_html ? stripHtmlToText(input.email_html) : "";
    const searchSpace = `${subject}\n${plainBody}\n${htmlBody}`;

    // Marketing/Newsletter ausfiltern
    if (/(?:newsletter|werbung|angebot\s+der\s+woche|sonderaktion)/i.test(subject)) {
      return null;
    }

    // Subject-Pattern: "<digits>, DD.MM.YYYY, Mailversand"
    // Bestellnummer ist 8-stellige Ziffer am Subject-Anfang
    let bestellnummer: string | null = null;
    let datum: string | null = null;

    const subjectMatch = subject.match(/^\s*(\d{7,9})\s*,\s*(\d{1,2})\.(\d{1,2})\.(20\d{2})\s*,/);
    if (subjectMatch) {
      bestellnummer = subjectMatch[1];
      const [, , d, m, y] = subjectMatch;
      datum = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    } else {
      // Fallback: irgendwo im Subject 8-stellige Nummer
      const fallback = subject.match(/\b(\d{8})\b/);
      if (fallback) bestellnummer = fallback[1];

      // Datum-Fallback aus Subject/Body
      if (!datum) {
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
      }
    }

    if (!bestellnummer) return null;

    const typ = inferTyp(subject, plainBody);

    const document: DokumentAnalyse = {
      typ,
      vermutete_bestellungsart: "subunternehmer",
      bestellnummer,
      auftragsnummer: null,
      lieferscheinnummer: null,
      haendler: "Hold & Spada",
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
      kundennummer: null,
      besteller_im_dokument: null,
      projekt_referenz: null,
      bestelldatum: typ === "bestellbestaetigung" ? datum : null,
    };

    return {
      vendor: "hold-spada",
      parser_version: holdSpadaParser.version,
      konfidenz: 0.82,
      documents: [document],
    };
  },
};
