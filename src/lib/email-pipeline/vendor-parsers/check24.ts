/**
 * CHECK24 Parser.
 *
 * Domain: check24.de (DB-verifiziert 2026-05-05)
 * Multiple Sender-Localparts:
 *   - noreply.autoteile@check24.de   (CHECK24 Autoteile-Bestellungen)
 *   - handwerk@check24.de            (CHECK24 Handwerk Profis Prime)
 *   - kundenkonto@check24.de         (Account-Mails — nicht Pipeline-relevant)
 *
 * Bestellnummer-Pattern: alphanumerisch 6-8 Zeichen (z.B. "CBEPFVF").
 * Steht typisch im Subject NICHT, sondern im PDF-Anhang. Subject zeigt nur
 * Status: "Bestellung ist da", "Bestellung ist unterwegs", "Verfolgen Sie
 * Ihre Bestellung", "Ihre Rechnung für ...".
 *
 * Strategie: Vendor-Parser setzt Plattform-Anker (haendler="CHECK24") +
 * Doku-Typ aus Subject; Bestellnummer kommt aus dem PDF (KI ergänzt).
 *
 * Konfidenz: 0.6 für Bestellung-Lifecycle-Mails (unter Threshold → KI-Merge),
 * 0.55 für reine Account-Mails (kundenkonto@) — die sollten gar nicht in die
 * Pipeline kommen, aber zur Sicherheit explizit ausgefiltert.
 */

import type { DokumentAnalyse } from "@/lib/openai";
import type { VendorParser, VendorParseResult, VendorParserInput } from "./types";
import { stripHtmlToText } from "./utils";

type DokuTyp = DokumentAnalyse["typ"];

const CHECK24_DOMAINS = ["check24.de", "check24.com"];

function matches(input: VendorParserInput): boolean {
  const domain = input.email_domain.toLowerCase();
  return CHECK24_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
}

function inferTyp(subject: string): DokuTyp {
  const s = subject.toLowerCase();
  if (/rechnung|abbuchung\s+steht\s+an/.test(s)) return "rechnung";
  if (/(unterwegs|verfolgen|sendung|zugestellt|geliefert)/.test(s)) return "versandbestaetigung";
  if (/(bestellung\s+ist\s+da|bestellung\s+aufgegeben|bestätigung)/.test(s)) {
    return "bestellbestaetigung";
  }
  if (/(bestellung\s+von)/.test(s)) return "bestellbestaetigung";
  return "unbekannt";
}

export const check24Parser: VendorParser = {
  name: "check24",
  version: "1.0.0",

  matches,

  async parse(input: VendorParserInput): Promise<VendorParseResult | null> {
    const subject = input.email_betreff || "";
    const sender = (input.email_absender || "").toLowerCase();
    const plainBody = input.email_text || "";
    const htmlBody = input.email_html ? stripHtmlToText(input.email_html) : "";
    const searchSpace = `${subject}\n${plainBody}\n${htmlBody}`;

    // Account-Mails: Anmeldung, Einmalcode, Passwort-Reset → KEINE Pipeline-Doku
    if (sender.startsWith("kundenkonto@") || /(?:einmalcode|anmeldung|passwort\s+zurücksetzen)/i.test(subject)) {
      return null;
    }

    // Newsletter/Werbung
    if (/(?:newsletter|werbung|gutschein|deal\s+der|tagesangebot)/i.test(subject)) {
      return null;
    }

    const typ = inferTyp(subject);
    if (typ === "unbekannt") return null;

    // Bestellnummer: alphanumerisch 6-8 Zeichen, Body-Fallback
    // Subject hat sie meist nicht — als Anker reicht der Plattform-Name
    let bestellnummer: string | null = null;
    const pattern = searchSpace.match(/\bBestell(?:nummer|nr\.?)[:\s#-]*([A-Z0-9]{6,10})\b/i)
      || searchSpace.match(/\bBestellung[\s:#-]+([A-Z0-9]{6,10})\b/i);
    if (pattern) bestellnummer = pattern[1].toUpperCase();

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

    // Sub-Brand-Hint aus Sender-Localpart
    let haendler = "CHECK24";
    if (sender.startsWith("noreply.autoteile@")) haendler = "CHECK24 Autoteile";
    else if (sender.startsWith("handwerk@")) haendler = "CHECK24 Profis Prime";

    // bestellungsart
    const bestellungsart: DokumentAnalyse["vermutete_bestellungsart"] =
      sender.startsWith("handwerk@") ? "abo" : "material";

    // Konfidenz: höher wenn Bestellnummer extrahiert werden konnte
    const konfidenz = bestellnummer ? 0.8 : 0.6;

    const document: DokumentAnalyse = {
      typ,
      vermutete_bestellungsart: bestellungsart,
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
      bestelldatum: typ === "bestellbestaetigung" ? datum : null,
    };

    return {
      vendor: "check24",
      parser_version: check24Parser.version,
      konfidenz,
      documents: [document],
    };
  },
};
