/**
 * Plancraft-Parser für Subunternehmer-Rechnungen.
 *
 * Plancraft ist ein Handwerker-SaaS, über das Subunternehmer ihre Rechnungen,
 * Angebote, Aufmaße und Leistungsnachweise versenden. Die Mail kommt also
 * von Plancraft IM AUFTRAG eines Subunternehmers — der wahre Sender steht
 * meistens im Subject und/oder Mail-Body, nicht in der Absender-Adresse.
 *
 * Beispiel-Subjects:
 *   "Rechnung 2026-042 von Elektro Müller GmbH"
 *   "Angebot 2026-AN-15 von Trockenbau Schmidt"
 *   "Aufmaß 2026-AM-7 von Sanitär Klein"
 *   "Leistungsnachweis Woche 17/2026 - Fliesenleger Aksoy"
 *
 * Strategie:
 * - Aus Subject Dokumenttyp + Nummer + SU-Firmenname extrahieren
 * - PDF-Anhang behalten der KI für detaillierte Artikel/Beträge (wir geben
 *   konfidenz unter 0.75 zurück → KI-Fallback merged unsere Daten als Hint)
 * - Damit gewinnen wir: zuverlässige SU-Firmen-Erkennung +
 *   Bestellnummer/Auftragsnummer ohne KI-Halluzination
 */

import type { DokumentAnalyse } from "@/lib/openai";
import type { VendorParser, VendorParseResult, VendorParserInput } from "./types";

const PLANCRAFT_DOMAINS = ["plancraft.com", "mail.plancraft.com", "plancraft.de"];

interface SubjectPattern {
  regex: RegExp;
  typ: DokumentAnalyse["typ"];
  artHint: "subunternehmer";
}

const SUBJECT_PATTERNS: SubjectPattern[] = [
  // "Rechnung 2026-042 von Elektro Müller GmbH"
  { regex: /^(?:Rechnung|Schlussrechnung|Abschlagsrechnung|Invoice)\s+([A-Z0-9][\w\-/.]{2,30})\s+(?:von|from)\s+(.+)$/i, typ: "rechnung", artHint: "subunternehmer" },
  { regex: /^(?:Angebot|Quotation)\s+([A-Z0-9][\w\-/.]{2,30})\s+(?:von|from)\s+(.+)$/i, typ: "bestellbestaetigung", artHint: "subunternehmer" },
  { regex: /^(?:Aufmaß|Aufmass|Massenermittlung)\s+([A-Z0-9][\w\-/.]{2,30})\s+(?:von|from)\s+(.+)$/i, typ: "aufmass", artHint: "subunternehmer" },
  { regex: /^(?:Leistungsnachweis|Stundennachweis|Rapportzettel)\s+(.+?)\s+-\s+(.+)$/i, typ: "leistungsnachweis", artHint: "subunternehmer" },
  { regex: /^Gutschrift\s+([A-Z0-9][\w\-/.]{2,30})\s+(?:von|from)\s+(.+)$/i, typ: "rechnung", artHint: "subunternehmer" },
];

function matchesPlancraft(input: VendorParserInput): boolean {
  const domain = input.email_domain.toLowerCase();
  return PLANCRAFT_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
}

interface SubjectMatch {
  typ: DokumentAnalyse["typ"];
  nummer: string;
  suFirma: string;
}

function parseSubject(subject: string): SubjectMatch | null {
  const trimmed = subject.trim();
  for (const p of SUBJECT_PATTERNS) {
    const m = trimmed.match(p.regex);
    if (m) {
      return {
        typ: p.typ,
        nummer: m[1].trim(),
        suFirma: m[2].trim(),
      };
    }
  }
  // Fallback: SU-Name nach "von" auch ohne Dokumenttyp im Subject erkennen
  const fallback = trimmed.match(/\b(?:von|from)\s+([\w& \-.]+(?:GmbH|UG|KG|AG|GbR|e\.K\.|GmbH & Co\. KG)?)$/i);
  if (fallback) {
    return {
      typ: "unbekannt",
      nummer: "",
      suFirma: fallback[1].trim(),
    };
  }
  return null;
}

function classifyArt(_typ: DokumentAnalyse["typ"]): DokumentAnalyse["vermutete_bestellungsart"] {
  return "subunternehmer";
}

export const plancraftParser: VendorParser = {
  name: "plancraft",
  version: "1.0.0",

  matches(input: VendorParserInput): boolean {
    return matchesPlancraft(input);
  },

  async parse(input: VendorParserInput): Promise<VendorParseResult | null> {
    const subjectMatch = parseSubject(input.email_betreff || "");
    if (!subjectMatch || !subjectMatch.suFirma) {
      // Plancraft-Mail ohne erkennbares SU-Pattern → KI muss ran
      return null;
    }

    const document: DokumentAnalyse = {
      typ: subjectMatch.typ,
      vermutete_bestellungsart: classifyArt(subjectMatch.typ),
      bestellnummer: subjectMatch.nummer || null,
      auftragsnummer: null,
      lieferscheinnummer: null,
      // Plancraft selbst ist NICHT der Händler — der eigentliche
      // SU-Firmenname wird hier reingelegt, damit ingest.ts diesen
      // dem Subunternehmer-Lookup geben kann
      haendler: subjectMatch.suFirma,
      datum: null,
      artikel: [],
      gesamtbetrag: null,
      netto: null,
      mwst: null,
      faelligkeitsdatum: null,
      lieferdatum: null,
      iban: null,
      // Bewusst niedrige Konfidenz: wir liefern Subject-Metadaten als Hint,
      // KI soll das PDF nochmal analysieren für Artikel + exakte Beträge
      konfidenz: 0.55,
      lieferadressen: [],
      volltext: input.email_text?.slice(0, 5000) ?? "",
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
      vendor: "plancraft",
      parser_version: plancraftParser.version,
      // < VENDOR_CONFIDENCE_THRESHOLD (0.75) → Caller wird KI als
      // Hauptanalyse aufrufen, unsere Daten kommen als Hint dazu
      konfidenz: 0.55,
      documents: [document],
    };
  },
};
