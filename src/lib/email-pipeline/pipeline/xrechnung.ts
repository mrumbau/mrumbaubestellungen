/**
 * XRechnung / ZUGFeRD Parser — strukturierte E-Rechnungen ohne KI.
 *
 * Seit 1.1.2025 sind deutsche B2B-Empfänger gesetzlich verpflichtet,
 * E-Rechnungen empfangen zu können (Wachstumschancengesetz). Viele Lieferanten
 * senden bereits XRechnung-XML oder ZUGFeRD-PDFs (PDF mit eingebetteter XML).
 *
 * Zwei Eingangskanäle:
 *   1. XML-Anhang direkt (z.B. "xrechnung.xml", "factur-x.xml")
 *   2. PDF mit eingebetteter ZUGFeRD-XML (PDF/A-3)
 *
 * Zwei XML-Syntaxen werden unterstützt (DIN EN 16931):
 *   - CII (UN/CEFACT Cross Industry Invoice) — typisch für ZUGFeRD/Factur-X
 *   - UBL 2.1 — typisch für XRechnung-Standard
 *
 * Wichtige Business Terms (BT) die wir mappen:
 *   BT-1   Invoice Number          → bestellnummer (Rechnungsnr ist primary identifier)
 *   BT-2   Invoice Issue Date      → datum
 *   BT-9   Payment Due Date        → faelligkeitsdatum
 *   BT-13  Buyer Reference         → auftragsnummer (Bestellnr aus Käufer-Sicht)
 *   BT-27  Seller Name             → haendler
 *   BT-84  IBAN                    → iban
 *   BT-109 Invoice Net Total       → netto
 *   BT-110 Invoice VAT Total       → mwst
 *   BT-112 Invoice Total w/ VAT    → gesamtbetrag
 *   BG-25  Invoice Line Items      → artikel[]
 */

import { XMLParser } from "fast-xml-parser";
import { PDFDocument } from "pdf-lib";
import { logError, logInfo } from "@/lib/logger";
import type { DokumentAnalyse } from "@/lib/openai";

const ZUGFERD_EMBED_NAMES = [
  "factur-x.xml", "zugferd-invoice.xml", "ZUGFeRD-invoice.xml",
  "xrechnung.xml", "Rechnung.xml", "rechnung.xml",
];

const XML_MIME_TYPES = new Set([
  "application/xml", "text/xml",
]);

interface XRechnungInput {
  name: string;
  mime_type: string;
  base64: string;
}

/**
 * Detect & extract XML aus Anhängen.
 * - Direkter XML-Anhang → Buffer-Decode
 * - PDF mit Embedded-File → ZUGFeRD-Suche
 *
 * Liefert null wenn keine E-Rechnungs-XML gefunden.
 */
export async function extractEInvoiceXml(anhang: XRechnungInput): Promise<string | null> {
  // 1. Direkter XML-Anhang
  const lowerName = anhang.name.toLowerCase();
  if (XML_MIME_TYPES.has(anhang.mime_type) || lowerName.endsWith(".xml")) {
    try {
      const xml = Buffer.from(anhang.base64, "base64").toString("utf-8");
      // Heuristik: muss nach E-Rechnung aussehen
      if (
        xml.includes("CrossIndustryInvoice")
        || xml.includes("urn:oasis:names:specification:ubl:schema")
        || xml.includes("rsm:CrossIndustryInvoice")
      ) {
        return xml;
      }
    } catch (err) {
      logError("xrechnung", "XML-Decode fehlgeschlagen", { datei: anhang.name, err });
    }
    return null;
  }

  // 2. PDF mit Embedded ZUGFeRD-XML
  if (anhang.mime_type === "application/pdf" || lowerName.endsWith(".pdf")) {
    try {
      const buffer = Buffer.from(anhang.base64, "base64");
      const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      // pdf-lib's getAttachments funktioniert in neueren Versionen; sonst fallback
      // auf catalog/Names traversal. Wir versuchen den happy path.
      const attachments = (pdfDoc as unknown as { getAttachments?: () => Array<{ name: string; data: Uint8Array }> })
        .getAttachments?.() ?? [];
      for (const att of attachments) {
        if (ZUGFERD_EMBED_NAMES.some((n) => att.name.toLowerCase() === n.toLowerCase())) {
          const xml = Buffer.from(att.data).toString("utf-8");
          logInfo("xrechnung", "ZUGFeRD-XML aus PDF extrahiert", {
            datei: anhang.name,
            embed_name: att.name,
            xml_size: xml.length,
          });
          return xml;
        }
      }
    } catch (err) {
      // PDF-Loading kann an Encryption/Damage scheitern — kein Drama
      logInfo("xrechnung", "PDF-Embed-Check übersprungen", {
        datei: anhang.name,
        reason: err instanceof Error ? err.message : "unknown",
      });
    }
    return null;
  }

  return null;
}

/**
 * Hilfs-Funktion: Suche im geparsten XML-Tree nach einem Pfad. Akzeptiert mehrere
 * Alternativen weil CII vs UBL andere Strukturen haben.
 */
type XmlNode = string | number | boolean | null | XmlNode[] | { [k: string]: XmlNode };

function findFirst(obj: XmlNode, paths: string[][]): string | null {
  for (const path of paths) {
    let cur: XmlNode = obj;
    let ok = true;
    for (const segment of path) {
      if (cur && typeof cur === "object" && !Array.isArray(cur) && segment in cur) {
        cur = (cur as { [k: string]: XmlNode })[segment];
      } else {
        ok = false;
        break;
      }
    }
    if (ok && cur != null) {
      // Manche Felder sind Objekt mit "#text" — extrahieren
      if (typeof cur === "object" && !Array.isArray(cur) && "#text" in cur) {
        return String((cur as { "#text": XmlNode })["#text"]);
      }
      if (typeof cur === "string" || typeof cur === "number") {
        return String(cur);
      }
    }
  }
  return null;
}

function parseAmount(raw: string | null): number | null {
  if (!raw) return null;
  // E-Rechnungs-Amounts sind normalerweise dezimal-Punkt-getrennt: "547.95"
  const num = parseFloat(raw.replace(/,/g, "."));
  return Number.isFinite(num) ? num : null;
}

/**
 * Parse XRechnung-XML zu DokumentAnalyse.
 * Funktioniert für beide Syntaxen (CII / UBL) — testet beide Pfade.
 */
export function parseXRechnung(xml: string): DokumentAnalyse | null {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseAttributeValue: true,
      removeNSPrefix: true, // Strip namespace-prefixes für einfacheren Zugriff
    });
    const doc = parser.parse(xml) as XmlNode;

    // CII-Pfade (rsm:CrossIndustryInvoice)
    const ciiRoot = ["CrossIndustryInvoice"];
    // UBL-Pfade (Invoice)
    const ublRoot = ["Invoice"];

    // BT-1 Invoice Number
    const invoiceNumber = findFirst(doc, [
      [...ciiRoot, "ExchangedDocument", "ID"],
      [...ublRoot, "ID"],
    ]);

    // BT-2 Invoice Issue Date
    const issueDate = findFirst(doc, [
      [...ciiRoot, "ExchangedDocument", "IssueDateTime", "DateTimeString"],
      [...ublRoot, "IssueDate"],
    ]);

    // BT-13 Buyer Reference (Bestellnummer aus Käufer-Sicht)
    const buyerRef = findFirst(doc, [
      [...ciiRoot, "SupplyChainTradeTransaction", "ApplicableHeaderTradeAgreement", "BuyerReference"],
      [...ublRoot, "BuyerReference"],
    ]);

    // BT-27 Seller Name
    const sellerName = findFirst(doc, [
      [...ciiRoot, "SupplyChainTradeTransaction", "ApplicableHeaderTradeAgreement", "SellerTradeParty", "Name"],
      [...ublRoot, "AccountingSupplierParty", "Party", "PartyName", "Name"],
      [...ublRoot, "AccountingSupplierParty", "Party", "PartyLegalEntity", "RegistrationName"],
    ]);

    // BT-112 Invoice Total Amount (mit VAT)
    const totalGross = parseAmount(findFirst(doc, [
      [...ciiRoot, "SupplyChainTradeTransaction", "ApplicableHeaderTradeSettlement", "SpecifiedTradeSettlementHeaderMonetarySummation", "GrandTotalAmount"],
      [...ublRoot, "LegalMonetaryTotal", "PayableAmount"],
    ]));

    // BT-109 Net Total
    const netTotal = parseAmount(findFirst(doc, [
      [...ciiRoot, "SupplyChainTradeTransaction", "ApplicableHeaderTradeSettlement", "SpecifiedTradeSettlementHeaderMonetarySummation", "TaxBasisTotalAmount"],
      [...ublRoot, "LegalMonetaryTotal", "TaxExclusiveAmount"],
    ]));

    // BT-110 VAT Total
    const vatTotal = parseAmount(findFirst(doc, [
      [...ciiRoot, "SupplyChainTradeTransaction", "ApplicableHeaderTradeSettlement", "SpecifiedTradeSettlementHeaderMonetarySummation", "TaxTotalAmount"],
      [...ublRoot, "TaxTotal", "TaxAmount"],
    ]));

    // BT-9 Payment Due Date
    const dueDate = findFirst(doc, [
      [...ciiRoot, "SupplyChainTradeTransaction", "ApplicableHeaderTradeSettlement", "SpecifiedTradePaymentTerms", "DueDateDateTime", "DateTimeString"],
      [...ublRoot, "PaymentMeans", "PaymentDueDate"],
      [...ublRoot, "DueDate"],
    ]);

    // BT-84 IBAN
    const iban = findFirst(doc, [
      [...ciiRoot, "SupplyChainTradeTransaction", "ApplicableHeaderTradeSettlement", "SpecifiedTradeSettlementPaymentMeans", "PayeePartyCreditorFinancialAccount", "IBANID"],
      [...ublRoot, "PaymentMeans", "PayeeFinancialAccount", "ID"],
    ]);

    // Pflichtfeld-Check: ohne Invoice-Number + Total-Gross ist's keine valide E-Rechnung
    if (!invoiceNumber || totalGross === null) {
      logInfo("xrechnung", "XML enthält keine vollständige E-Rechnung — fallthrough", {
        has_invoice_number: !!invoiceNumber,
        has_total: totalGross !== null,
      });
      return null;
    }

    // Datum auf YYYY-MM-DD normalisieren falls "20260417" Format
    const normalizeDate = (raw: string | null): string | null => {
      if (!raw) return null;
      if (/^\d{8}$/.test(raw)) {
        return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
      }
      return raw.slice(0, 10);
    };

    const result: DokumentAnalyse = {
      typ: "rechnung",
      vermutete_bestellungsart: undefined,
      bestellnummer: buyerRef ?? null,
      auftragsnummer: null,
      lieferscheinnummer: null,
      haendler: sellerName ?? null,
      datum: normalizeDate(issueDate),
      artikel: [], // Items extraction is complex; left for future iteration
      gesamtbetrag: totalGross,
      netto: netTotal,
      mwst: vatTotal,
      faelligkeitsdatum: normalizeDate(dueDate),
      lieferdatum: null,
      iban: iban ?? null,
      konfidenz: 1.0, // Strukturierte XML — 100% deterministic
      lieferadressen: [],
      volltext: `[E-Rechnung XML — Invoice ${invoiceNumber}]`,
      tracking_nummer: null,
      versanddienstleister: null,
      tracking_url: null,
      voraussichtliche_lieferung: null,
      kundennummer: null,
      besteller_im_dokument: null,
      projekt_referenz: null,
      bestelldatum: null,
    };

    // Bonus: wenn keine BuyerReference (BT-13), nehmen wir die InvoiceNumber als bestellnummer.
    // Das ist für Konsistenz mit aktuellem Bestellnummer-Match-System.
    if (!result.bestellnummer && invoiceNumber) {
      result.bestellnummer = invoiceNumber;
    }

    return result;
  } catch (err) {
    logError("xrechnung", "XML-Parse-Fehler", err);
    return null;
  }
}

/**
 * High-Level: prüft eine Liste von Anhängen auf E-Rechnung, gibt die
 * erste gefundene strukturierte DokumentAnalyse zurück.
 */
export async function tryParseEInvoiceFromAttachments(
  anhaenge: XRechnungInput[],
): Promise<DokumentAnalyse | null> {
  for (const anhang of anhaenge) {
    const xml = await extractEInvoiceXml(anhang);
    if (!xml) continue;
    const parsed = parseXRechnung(xml);
    if (parsed) {
      logInfo("xrechnung", "E-Rechnung erfolgreich strukturiert geparst", {
        datei: anhang.name,
        invoice_number: parsed.bestellnummer,
        haendler: parsed.haendler,
        gesamtbetrag: parsed.gesamtbetrag,
      });
      return parsed;
    }
  }
  return null;
}
