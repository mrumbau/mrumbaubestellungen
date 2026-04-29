/**
 * Amazon-Parser.
 *
 * Amazon sendet ZWEI Mail-Typen die uns interessieren:
 * 1. "Bestellbestätigung von Amazon.de" (typ=bestellbestaetigung)
 *    → Subject: "Bestellbestätigung von Amazon.de #305-1234567-1234567"
 *    → Body enthält: Bestellnummer, Artikel, Beträge, Lieferadresse
 * 2. "Ihre Versanddetails für Bestellung #305-..." (typ=versandbestaetigung)
 *    → Subject: "Ihre Versanddetails / shipped"
 *    → Body enthält: Bestellnummer, Tracking-Nummer
 *
 * Diese Parser ersetzen die KI-Klassifikation des E-Mail-Texts vollständig.
 * Anhänge (selten bei Amazon) werden NICHT von diesem Parser verarbeitet —
 * dafür läuft weiter die normale analysiereDokument-Pipeline.
 *
 * Das Amazon-Bestellnummer-Format ist seit Jahren stabil:
 *   3-stellige Marktplatz-ID + "-" + 7-stellige Order-ID + "-" + 7-stellige Item-ID
 *   z.B. 305-1234567-1234567, 302-9718187-1234567, etc.
 */

import type { DokumentAnalyse } from "@/lib/openai";
import type { VendorParser, VendorParseResult, VendorParserInput } from "./types";
import { parseGermanDate, parseEuroAmount } from "./utils";

const AMAZON_DOMAINS = [
  "amazon.de",
  "amazon.com",
  "amazonbusiness.de",
  "marketplace.amazon.de",
];

const ORDER_NUMBER_REGEX = /(\d{3}-\d{7}-\d{7})/;
const TRACKING_REGEX_DHL = /\b(\d{12,20})\b/;

function classifyDocumentType(
  subject: string,
  body: string,
): DokumentAnalyse["typ"] {
  const s = subject.toLowerCase();
  const b = body.toLowerCase();

  // Versand zuerst — Subject ist klar
  if (
    s.includes("versanddetails") ||
    s.includes("versandbestätigung") ||
    s.includes("shipped") ||
    s.includes("ihre sendung") ||
    b.includes("ihre sendung wurde versendet") ||
    b.includes("ihre bestellung wurde verschickt")
  ) {
    return "versandbestaetigung";
  }

  if (
    s.includes("bestellbestätigung") ||
    s.includes("ihre bestellung bei amazon") ||
    b.includes("vielen dank für ihre bestellung")
  ) {
    return "bestellbestaetigung";
  }

  // Rechnung-Mail (selten, meist als PDF-Anhang — der wird woanders behandelt)
  if (s.includes("rechnung") || s.includes("invoice")) {
    return "rechnung";
  }

  return "unbekannt";
}

function extractArtikel(text: string): DokumentAnalyse["artikel"] {
  // Vereinfachung: Amazon-Plain-Text-Body hat Artikel mit "Menge:" + "EUR ..."
  // Wir extrahieren grob — KI-Fallback liefert detaillierter
  const artikel: DokumentAnalyse["artikel"] = [];
  // Pattern: "Menge: 1\n... EUR 234,99" — beliebige Zeilen dazwischen
  const blockRegex =
    /Menge:?\s*(\d+)[\s\S]{1,200}?EUR\s*([\d.,]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(text)) !== null) {
    const menge = parseInt(m[1], 10) || 1;
    const einzelpreis = parseEuroAmount(m[2]) ?? 0;
    // F3.D2: Generischer Platzhalter — Amazon-Mails haben keinen extrahierbaren
    // Artikel-Namen im Body (ASIN nur in Webshop sichtbar). Match-Logic darf
    // sich auf Artikel-Namen nicht stützen für Amazon — daher leerer String
    // statt verwirrendem "Amazon-Artikel".
    artikel.push({
      name: "",
      menge,
      einzelpreis,
      gesamtpreis: einzelpreis * menge,
    });
  }
  return artikel;
}

function extractTrackingNumber(text: string): {
  nummer: string | null;
  dienstleister: string | null;
} {
  // DHL/DPD/UPS Pattern-Detection grob
  const dhl = text.match(/sendungs(?:nummer|info)[:\s]*([A-Z0-9]{8,})/i);
  if (dhl) return { nummer: dhl[1], dienstleister: "DHL" };
  const generic = text.match(/tracking[:\s-]*nr\.?[:\s]*([A-Z0-9]{8,})/i);
  if (generic) return { nummer: generic[1], dienstleister: null };
  const longNum = text.match(TRACKING_REGEX_DHL);
  if (longNum && longNum[1].length >= 12 && longNum[1].length <= 20) {
    return { nummer: longNum[1], dienstleister: "DHL" };
  }
  return { nummer: null, dienstleister: null };
}

function extractLieferadresse(text: string): string[] {
  // Amazon-Pattern: "Liefer-Adresse:" oder "Lieferanschrift:"
  const m = text.match(/Liefer-?\s*(?:adresse|anschrift)[:\s]*\n([\s\S]{20,400}?)(?:\n\n|Bestellsumme|Zwischensumme|Mehrwertsteuer)/i);
  if (!m) return [];
  return [m[1].trim().replace(/\s+/g, " ")];
}

export const amazonParser: VendorParser = {
  name: "amazon",
  version: "1.0.0",

  matches(input: VendorParserInput) {
    if (AMAZON_DOMAINS.some((d) => input.email_domain === d || input.email_domain.endsWith("." + d))) {
      return true;
    }
    // Fallback: Subject mit Amazon-Bestellnummer-Format
    return ORDER_NUMBER_REGEX.test(input.email_betreff);
  },

  async parse(input: VendorParserInput): Promise<VendorParseResult | null> {
    const subject = input.email_betreff || "";
    const body = input.email_text || "";

    // 1. Bestellnummer (Pflichtfeld) — zuerst aus Subject (zuverlässiger), dann Body
    const subjectMatch = subject.match(ORDER_NUMBER_REGEX);
    const bodyMatch = body.match(ORDER_NUMBER_REGEX);
    const bestellnummer = subjectMatch?.[1] ?? bodyMatch?.[1] ?? null;

    if (!bestellnummer) {
      // Ohne Bestellnummer können wir Amazon-Mails nicht zuverlässig zuordnen
      return null;
    }

    // 2. Dokumenttyp
    const typ = classifyDocumentType(subject, body);

    // 3. Beträge
    const gesamtMatch = body.match(/Gesamtsumme:?\s*EUR\s*([\d.,]+)/i)
      ?? body.match(/Bestellsumme:?\s*EUR\s*([\d.,]+)/i)
      ?? body.match(/Order\s*Total:?\s*EUR\s*([\d.,]+)/i);
    const gesamtbetrag = gesamtMatch ? parseEuroAmount(gesamtMatch[1]) : null;

    const mwstMatch = body.match(/Mehrwertsteuer:?\s*EUR\s*([\d.,]+)/i)
      ?? body.match(/MwSt\.?:?\s*EUR\s*([\d.,]+)/i)
      ?? body.match(/VAT:?\s*EUR\s*([\d.,]+)/i);
    const mwst = mwstMatch ? parseEuroAmount(mwstMatch[1]) : null;

    const netto = gesamtbetrag !== null && mwst !== null
      ? Math.round((gesamtbetrag - mwst) * 100) / 100
      : null;

    // 4. Datum (Bestelldatum oder Versanddatum, je nach Mail-Typ)
    const dateMatch = body.match(/Bestellt am\s*(\d{1,2}\.\s*\w+\s*\d{4})/i)
      ?? body.match(/(?:Versendet am|Versanddatum)[:\s]*(\d{1,2}\.\s*\w+\s*\d{4})/i)
      ?? body.match(/(\d{1,2}\.\d{1,2}\.\d{4})/);
    const datum = dateMatch ? parseGermanDate(dateMatch[1]) : null;

    // 5. Liefer-Termin
    const liefertermin = body.match(/Liefer(?:termin|datum)[:\s]*\w+[,\s]+(\d{1,2}\.\s*\w+)/i);
    const lieferdatum = liefertermin
      ? parseGermanDate(liefertermin[1] + " " + new Date().getFullYear())
      : null;

    // 6. Tracking (nur bei Versand-Mails)
    const tracking = typ === "versandbestaetigung"
      ? extractTrackingNumber(body)
      : { nummer: null, dienstleister: null };

    // 7. Artikel
    const artikel = extractArtikel(body);

    // 8. Lieferadressen
    const lieferadressen = extractLieferadresse(body);

    // 9. Konfidenz-Bewertung
    let konfidenz = 0.5;
    if (bestellnummer) konfidenz += 0.3;
    if (gesamtbetrag !== null) konfidenz += 0.1;
    if (datum) konfidenz += 0.05;
    if (typ !== "unbekannt") konfidenz += 0.05;
    konfidenz = Math.min(konfidenz, 1.0);

    const document: DokumentAnalyse = {
      typ,
      vermutete_bestellungsart: "material",
      bestellnummer,
      auftragsnummer: null,
      lieferscheinnummer: null,
      haendler: "Amazon",
      datum,
      artikel,
      gesamtbetrag,
      netto,
      mwst,
      faelligkeitsdatum: null,
      lieferdatum,
      iban: null,
      konfidenz,
      lieferadressen,
      volltext: body.slice(0, 5000),
      tracking_nummer: tracking.nummer,
      versanddienstleister: tracking.dienstleister,
      tracking_url: null,
      voraussichtliche_lieferung: lieferdatum,
      kundennummer: null,
      besteller_im_dokument: null,
      projekt_referenz: null,
      bestelldatum: datum,
    };

    return {
      vendor: "amazon",
      parser_version: amazonParser.version,
      konfidenz,
      documents: [document],
    };
  },
};
