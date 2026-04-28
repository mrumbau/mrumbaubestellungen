/**
 * Raab Karcher / STARK Deutschland Parser.
 *
 * Mit 21 Bestellungen unser meistbenutzter Lieferant. STARK verwendet
 * standardisierte Header-Formate mit der Hauptnummer direkt nach dem
 * Dokumenttyp-Wort:
 *
 *   "AUFTRAGSBESTÄTIGUNG 2030485657"
 *   "DIGITALER LIEFERSCHEIN 4313393316"
 *   "RECHNUNG 8778719837"
 *   "GUTSCHRIFT 8778720001"
 *
 * Diese Nummern sind eindeutig und stabil — perfekt für deterministische
 * Extraktion. Die KI macht hier oft Fehler weil "Bes-Nr." (Projektreferenz
 * wie "BV: Glögler") fälschlich als Bestellnummer interpretiert wird.
 *
 * Außerdem nutzt STARK das EDI-Format "DIGITALER LIEFERSCHEIN" das
 * Preise enthält obwohl es ein Lieferschein ist — die KI klassifiziert
 * das gelegentlich als Rechnung. Folder-Hint hilft, deterministischer
 * Parser hilft mehr.
 */

import type { DokumentAnalyse } from "@/lib/openai";
import type { VendorParser, VendorParseResult, VendorParserInput } from "./types";
import { parseGermanDate, parseEuroAmount, stripHtmlToText } from "./utils";

const RAAB_DOMAINS = [
  "raabkarcher.de",
  "raab-karcher.de",
  "stark-deutschland.de",
  "stark.de",
];
/** Sender-Adressen die wir aus realen E-Mails kennen sollten. Domain-Match ist primär. */
const RAAB_SENDER_HINTS = [
  "noreply@stark",
  "info@raab",
  "edi@stark",
];

interface DocTypePattern {
  regex: RegExp;
  typ: DokumentAnalyse["typ"];
  /** Welches Feld die Hauptnummer dort befüllt */
  field: "auftragsnummer" | "lieferscheinnummer" | "bestellnummer";
}

const DOC_TYPE_PATTERNS: DocTypePattern[] = [
  { regex: /AUFTRAGSBEST[ÄA]TIGUNG\s+(\d{8,12})/i, typ: "bestellbestaetigung", field: "auftragsnummer" },
  { regex: /DIGITALER\s+LIEFERSCHEIN\s+(\d{8,12})/i, typ: "lieferschein", field: "lieferscheinnummer" },
  { regex: /\bLIEFERSCHEIN\s+(\d{8,12})/i, typ: "lieferschein", field: "lieferscheinnummer" },
  { regex: /\bRECHNUNG\s+(\d{8,12})/i, typ: "rechnung", field: "bestellnummer" },
  { regex: /SCHLUSSRECHNUNG\s+(\d{8,12})/i, typ: "rechnung", field: "bestellnummer" },
  { regex: /GUTSCHRIFT\s+(\d{8,12})/i, typ: "rechnung", field: "bestellnummer" },
];

function matchesRaab(input: VendorParserInput): boolean {
  const domain = input.email_domain.toLowerCase();
  if (RAAB_DOMAINS.some((d) => domain === d || domain.endsWith("." + d))) {
    return true;
  }
  const sender = input.email_absender.toLowerCase();
  if (RAAB_SENDER_HINTS.some((h) => sender.includes(h))) {
    return true;
  }
  // Subject-Hint: Raab verschickt oft mit "raab" oder "stark" im Subject
  const subj = input.email_betreff.toLowerCase();
  if (subj.includes("raab karcher") || subj.includes("stark deutschland") || subj.includes("digitaler lieferschein")) {
    return true;
  }
  return false;
}

function extractAdditionalNumbers(text: string): {
  auftragsnummer: string | null;
  lieferscheinnummer: string | null;
} {
  // Wenn das Hauptdokument z.B. eine Rechnung ist, kann die zugehörige
  // Auftrags-Nr. trotzdem im Text stehen — wir extrahieren sie zusätzlich
  // damit der Abgleich-Schritt die Dokumente verknüpfen kann.
  const auftrags = text.match(/Auftrags-?\s*Nr\.?:?\s*(\d{8,12})/i);
  const lieferschein = text.match(/Lieferschein-?\s*Nr\.?:?\s*(\d{8,12})/i);
  return {
    auftragsnummer: auftrags?.[1] ?? null,
    lieferscheinnummer: lieferschein?.[1] ?? null,
  };
}

function extractProjektReferenz(text: string): string | null {
  // STARK-typische Patterns:
  //   "Bes-Nr.: BV Glögler, Prinzenstr. 42"
  //   "Kommission: Dörning"
  //   "BV: Klöggler"
  const patterns = [
    /Bes-?\s*Nr\.?:\s*([^\n]{5,120})/i,
    /Kommission:\s*([^\n]{3,80})/i,
    /BV:?\s*([^\n]{5,80})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) {
      return m[1].trim().replace(/\s+/g, " ");
    }
  }
  return null;
}

function extractKundennummer(text: string): string | null {
  const m = text.match(/Kunden-?\s*Nr\.?:?\s*(\d{6,12})/i);
  return m?.[1] ?? null;
}

function extractBestellerHinweis(text: string): string | null {
  // STARK schreibt "Besteller: Tschon,Marlon" oder ähnlich
  const m = text.match(/Besteller:?\s*([A-ZÄÖÜ][\w,. -]{3,60})/);
  return m?.[1]?.trim() ?? null;
}

function extractGesamtbetrag(text: string): { betrag: number | null; mwst: number | null; netto: number | null } {
  // Heuristik: gesucht werden mehrere Beträge mit deutschen Zahlen
  const gesamtPatterns = [
    /Bruttobetrag[:\s]*([\d.,]+)/i,
    /Gesamtbetrag[:\s]*([\d.,]+)/i,
    /Rechnungsbetrag[:\s]*([\d.,]+)/i,
    /Endbetrag[:\s]*([\d.,]+)/i,
    /Summe\s+brutto[:\s]*([\d.,]+)/i,
  ];
  let betrag: number | null = null;
  for (const p of gesamtPatterns) {
    const m = text.match(p);
    if (m) {
      betrag = parseEuroAmount(m[1]);
      if (betrag !== null) break;
    }
  }

  const mwstM =
    text.match(/(?:MwSt|Mehrwertsteuer|Umsatzsteuer)\.?\s*\d{0,2}\s*%?[:\s]*([\d.,]+)/i)
    ?? text.match(/USt\.?[:\s]*([\d.,]+)/i);
  const mwst = mwstM ? parseEuroAmount(mwstM[1]) : null;

  const nettoM =
    text.match(/Nettobetrag[:\s]*([\d.,]+)/i)
    ?? text.match(/Summe\s+netto[:\s]*([\d.,]+)/i);
  const netto = nettoM ? parseEuroAmount(nettoM[1]) : null;

  return { betrag, mwst, netto };
}

function extractIban(text: string): string | null {
  const m = text.match(/\b(DE\d{2}[\s\d]{18,32})\b/i);
  if (!m) return null;
  return m[1].replace(/\s+/g, " ").trim();
}

function extractFaelligkeit(text: string): string | null {
  const m =
    text.match(/Zahlungsziel[:\s]*(?:bis\s+)?(\d{1,2}\.\d{1,2}\.\d{4})/i)
    ?? text.match(/Fälligkeit(?:sdatum)?[:\s]*(\d{1,2}\.\d{1,2}\.\d{4})/i)
    ?? text.match(/Zahlbar\s+(?:bis|am)\s+(\d{1,2}\.\d{1,2}\.\d{4})/i);
  return m ? parseGermanDate(m[1]) : null;
}

export const raabKarcherParser: VendorParser = {
  name: "raab-karcher",
  version: "1.0.0",

  matches(input: VendorParserInput): boolean {
    return matchesRaab(input);
  },

  async parse(input: VendorParserInput): Promise<VendorParseResult | null> {
    const subject = input.email_betreff || "";
    const plainBody = input.email_text || "";
    const htmlBody = input.email_html ? stripHtmlToText(input.email_html) : "";
    // Suchraum: Subject + Plain + HTML-stripped (Maximalwert)
    const searchSpace = `${subject}\n${plainBody}\n${htmlBody}`;

    // 1. Dokumenttyp + Hauptnummer
    let typ: DokumentAnalyse["typ"] = "unbekannt";
    let hauptnummer: string | null = null;
    let mainField: DocTypePattern["field"] | null = null;

    for (const pattern of DOC_TYPE_PATTERNS) {
      const m = searchSpace.match(pattern.regex);
      if (m) {
        typ = pattern.typ;
        hauptnummer = m[1];
        mainField = pattern.field;
        break;
      }
    }

    if (!hauptnummer) {
      // Ohne Hauptnummer keine zuverlässige Zuordnung — KI macht's
      return null;
    }

    // 2. Sekundäre Nummern (für Abgleich-Verknüpfung)
    const additional = extractAdditionalNumbers(searchSpace);

    // 3. Felder
    const auftragsnummer =
      mainField === "auftragsnummer" ? hauptnummer : additional.auftragsnummer;
    const lieferscheinnummer =
      mainField === "lieferscheinnummer" ? hauptnummer : additional.lieferscheinnummer;
    const bestellnummer = mainField === "bestellnummer" ? hauptnummer : null;

    // 4. Beträge
    const { betrag, mwst, netto } = extractGesamtbetrag(searchSpace);

    // 5. Datum
    const dateMatch =
      searchSpace.match(/(?:Beleg|Rechnungs|Auftrags|Lieferschein)?-?\s*Datum:?\s*(\d{1,2}\.\d{1,2}\.\d{4})/i)
      ?? searchSpace.match(/vom\s+(\d{1,2}\.\d{1,2}\.\d{4})/i);
    const datum = dateMatch ? parseGermanDate(dateMatch[1]) : null;

    // 6. Sonstige
    const projektReferenz = extractProjektReferenz(searchSpace);
    const kundennummer = extractKundennummer(searchSpace);
    const besteller = extractBestellerHinweis(searchSpace);
    const iban = extractIban(searchSpace);
    const faelligkeitsdatum = extractFaelligkeit(searchSpace);

    // 7. Konfidenz
    let konfidenz = 0.5;
    if (hauptnummer) konfidenz += 0.25;
    if (typ !== "unbekannt") konfidenz += 0.1;
    if (betrag !== null) konfidenz += 0.05;
    if (datum) konfidenz += 0.05;
    if (projektReferenz) konfidenz += 0.05;
    konfidenz = Math.min(konfidenz, 0.95);
    // Hinweis: Bei Raab Karcher beim PDF-Anhang oft mehr Detail im PDF —
    // wir bleiben bei 0.95 statt 1.0 damit bei mehrdeutigen Mails KI noch
    // einspringen kann (Cap, weil Body-only Information unvollständig sein kann)

    const document: DokumentAnalyse = {
      typ,
      vermutete_bestellungsart: "material",
      bestellnummer: bestellnummer ?? auftragsnummer ?? lieferscheinnummer,
      auftragsnummer,
      lieferscheinnummer,
      haendler: "Raab Karcher - Stark Deutschland GmbH",
      datum,
      artikel: [],
      gesamtbetrag: betrag,
      netto,
      mwst,
      faelligkeitsdatum,
      lieferdatum: typ === "lieferschein" ? datum : null,
      iban,
      konfidenz,
      lieferadressen: [],
      volltext: plainBody.slice(0, 5000),
      tracking_nummer: null,
      versanddienstleister: null,
      tracking_url: null,
      voraussichtliche_lieferung: null,
      kundennummer,
      besteller_im_dokument: besteller,
      projekt_referenz: projektReferenz,
      bestelldatum: datum,
    };

    return {
      vendor: "raab-karcher",
      parser_version: raabKarcherParser.version,
      konfidenz,
      documents: [document],
    };
  },
};
