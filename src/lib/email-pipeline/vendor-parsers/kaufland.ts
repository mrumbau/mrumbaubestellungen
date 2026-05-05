/**
 * Kaufland Marketplace Parser.
 *
 * Kaufland-Marketplace ist B2C-/B2B-Plattform mit eigenständigen Bestellnummern:
 *   Subject: "Rechnung zu deiner Bestellung MXXXXXXX"
 *   Subject: "Deine Bestellung MXXXXXXX wurde versendet"
 *   Subject: "Bestellbestätigung MXXXXXXX"
 *   Sender:  noreply@kaufland-marktplatz.de / service@kaufland-marktplatz.de
 *
 * Bestellnummer-Pattern: `M[A-Z0-9]{6,8}` (z.B. M1234567, M12ABCDE)
 *
 * Anhang: PDF-Rechnung von einem Marketplace-Verkäufer (NICHT von Kaufland selbst)
 *   → der "haendler" ist meist der Marketplace-Verkäufer, nicht Kaufland.
 *   Vendor-Parser kann das nicht zuverlässig aus dem Subject ableiten,
 *   deshalb setzt er "Kaufland Marketplace" als Plattform-Name.
 *
 * Konfidenz 0.8: Subject + Bestellnummer sind eindeutig, Verkäufer + Beträge
 * stehen nur im PDF — KI ergänzt das.
 */

import type { DokumentAnalyse } from "@/lib/openai";
import type { VendorParser, VendorParseResult, VendorParserInput } from "./types";
import { stripHtmlToText } from "./utils";

const KAUFLAND_DOMAINS = ["kaufland-marktplatz.de", "kaufland.de"];

function matches(input: VendorParserInput): boolean {
  const domain = input.email_domain.toLowerCase();
  return KAUFLAND_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
}

function inferTyp(subject: string): DokumentAnalyse["typ"] {
  const s = subject.toLowerCase();
  if (/rechnung/.test(s)) return "rechnung";
  if (/versendet|versandbest|versand/.test(s)) return "versandbestaetigung";
  if (/bestellbestätigung|bestellbestaetigung|bestellung\s+(eingegangen|aufgegeben|bestätigt)/.test(s)) {
    return "bestellbestaetigung";
  }
  return "unbekannt";
}

export const kauflandParser: VendorParser = {
  name: "kaufland-marketplace",
  version: "1.0.0",

  matches,

  async parse(input: VendorParserInput): Promise<VendorParseResult | null> {
    const subject = input.email_betreff || "";
    const plainBody = input.email_text || "";
    const htmlBody = input.email_html ? stripHtmlToText(input.email_html) : "";
    const searchSpace = `${subject}\n${plainBody}\n${htmlBody}`;

    // Marketing-/Newsletter-Mails ausfiltern
    if (/(?:newsletter|werbung|angebot|gutschein|deal\s+der\s+woche)/i.test(subject)) {
      return null;
    }

    // Bestellnummer: M + 6-8 alphanumerisch (Buchstaben Großschrift + Digits)
    // Subject hat Vorrang; Body als Fallback (manchmal ist Subject anders formuliert)
    let bestellnummer: string | null = null;
    const subjectMatch = subject.match(/\b(M[A-Z0-9]{6,8})\b/);
    if (subjectMatch) {
      bestellnummer = subjectMatch[1];
    } else {
      // Body-Fallback: nach "Bestellung" oder "Bestellnummer" + M-Pattern
      const bodyMatch = searchSpace.match(/(?:Bestellung|Bestellnummer|Order)[:\s#-]*\b(M[A-Z0-9]{6,8})\b/i);
      if (bodyMatch) bestellnummer = bodyMatch[1].toUpperCase();
    }

    if (!bestellnummer) return null;

    const typ = inferTyp(subject);

    // Datum: Body — typisch "vom DD.MM.YYYY" oder ISO
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

    // Tracking-Hinweis bei Versandbestätigung
    let tracking_nummer: string | null = null;
    let tracking_url: string | null = null;
    let versanddienstleister: string | null = null;
    if (typ === "versandbestaetigung") {
      // DHL ist häufigster Carrier bei Kaufland MP
      const dhlMatch = searchSpace.match(/\b(\d{12,20})\b/);
      if (dhlMatch && /dhl/i.test(searchSpace)) {
        tracking_nummer = dhlMatch[1];
        versanddienstleister = "DHL";
      }
      const urlMatch = searchSpace.match(/(https?:\/\/[^\s<>"]+(?:tracking|sendung|track)[^\s<>"]*)/i);
      if (urlMatch) tracking_url = urlMatch[1];
    }

    const document: DokumentAnalyse = {
      typ,
      vermutete_bestellungsart: "material",
      bestellnummer,
      auftragsnummer: null,
      lieferscheinnummer: null,
      haendler: "Kaufland Marketplace",
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
      tracking_nummer,
      versanddienstleister,
      tracking_url,
      voraussichtliche_lieferung: null,
      kundennummer: null,
      besteller_im_dokument: null,
      projekt_referenz: null,
      bestelldatum: typ === "bestellbestaetigung" ? datum : null,
    };

    return {
      vendor: "kaufland-marketplace",
      parser_version: kauflandParser.version,
      konfidenz: 0.8,
      documents: [document],
    };
  },
};
