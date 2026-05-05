/**
 * Elektroservice Feistbaur Parser (Subunternehmer).
 *
 * Sender: feistbaur@t-online.de — t-online.de ist eine generische Provider-
 * Domain, deshalb MUSS auf den Localpart "feistbaur" gematcht werden, nicht
 * auf die Domain selbst (würde sonst alle T-Online-Mails matchen).
 *
 * Rechnungsnummer steht NUR im PDF, nicht im Subject — Format `\d{6}-R`
 * (z.B. 309002-R). Subject ist meist "Rechnung Bauvorhaben XYZ" o.ä.
 *
 * Strategie:
 *   - Wenn Rechnungsnummer im Subject/Body extrahierbar → Konfidenz 0.72
 *   - Wenn nur Sender erkannt → Konfidenz 0.55 (Hint für haendler +
 *     vermutete_bestellungsart="subunternehmer", KI macht den Rest)
 *
 * Beide Fälle liegen unter VENDOR_CONFIDENCE_THRESHOLD (0.75) → KI wird
 * trotzdem aufgerufen, Vendor-Hint via mergeVendorIntoKi() gemerged.
 */

import type { DokumentAnalyse } from "@/lib/openai";
import type { VendorParser, VendorParseResult, VendorParserInput } from "./types";
import { stripHtmlToText } from "./utils";

type DokuTyp = DokumentAnalyse["typ"];

function matches(input: VendorParserInput): boolean {
  const sender = (input.email_absender || "").toLowerCase();
  // Strikt: Localpart "feistbaur" + Domain "t-online.de"
  return /^feistbaur@(.*\.)?t-online\.de$/.test(sender);
}

function inferTyp(subject: string, body: string): DokuTyp {
  const s = `${subject} ${body}`.toLowerCase();
  if (/rechnung|invoice/.test(s)) return "rechnung";
  if (/leistungsnachweis|stundenzettel|aufmaß|aufmass/.test(s)) return "leistungsnachweis";
  if (/angebot/.test(s)) return "unbekannt"; // Angebote kein Rechnungs-Schema
  return "rechnung"; // Default für SU-Korrespondenz
}

export const feistbaurParser: VendorParser = {
  name: "feistbaur",
  version: "1.0.0",

  matches,

  async parse(input: VendorParserInput): Promise<VendorParseResult | null> {
    const subject = input.email_betreff || "";
    const plainBody = input.email_text || "";
    const htmlBody = input.email_html ? stripHtmlToText(input.email_html) : "";
    const searchSpace = `${subject}\n${plainBody}\n${htmlBody}`;

    // Angebote überspringen — KI muss das anders behandeln
    if (/^Angebot\b/i.test(subject)) {
      return null;
    }

    const typ = inferTyp(subject, plainBody);

    // Rechnungsnummer-Pattern \d{6}-R im Subject oder Body
    const rechnungMatch = searchSpace.match(/\b(\d{6})-R\b/);
    const rechnungsnummer = rechnungMatch ? `${rechnungMatch[1]}-R` : null;

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

    // Konfidenz: höher wenn Rechnungsnummer extrahiert
    const konfidenz = rechnungsnummer ? 0.72 : 0.55;

    // Projekt-Referenz aus Subject extrahieren ("Rechnung Bauvorhaben XYZ")
    let projekt_referenz: string | null = null;
    const projektMatch = subject.match(/(?:Bauvorhaben|BV|Projekt|Objekt)[:\s-]+([^\n,;]{3,80})/i);
    if (projektMatch) projekt_referenz = projektMatch[1].trim();

    const document: DokumentAnalyse = {
      typ,
      vermutete_bestellungsart: "subunternehmer",
      bestellnummer: rechnungsnummer,
      auftragsnummer: null,
      lieferscheinnummer: null,
      haendler: "Elektroservice Feistbaur",
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
      vendor: "feistbaur",
      parser_version: feistbaurParser.version,
      konfidenz,
      documents: [document],
    };
  },
};
