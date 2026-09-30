/**
 * XRechnung / ZUGFeRD Parser Tests.
 *
 * Pipeline-kritisch: Schicht 1 von 3 in der neuen Pipeline-Architektur
 * (Sprint 04-05.05.2026). Strukturierte E-Rechnungen sind seit 1.1.2025 für
 * deutsche B2B-Empfänger Pflicht — Parser muss CII (UN/CEFACT) und UBL 2.1
 * verlässlich extrahieren, sonst landen E-Rechnungen in der KI-Pipeline und
 * werden teuer/fehleranfällig analysiert.
 *
 * Fixtures sind synthetische Minimal-XMLs nach DIN EN 16931 — kein echtes
 * Lieferanten-Sample (würde Geschäftsdaten enthalten).
 */

import { describe, it, expect } from "vitest";
import {
  parseXRechnung,
  extractEInvoiceXml,
  tryParseEInvoiceFromAttachments,
} from "../xrechnung";

// ---------------------------------------------------------------------------
// Fixture: CII (Cross Industry Invoice) — typisch ZUGFeRD/Factur-X
// ---------------------------------------------------------------------------
const CII_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocument>
    <ram:ID>RE-CII-12345</ram:ID>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">20260420</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>PROJ-2026-A</ram:BuyerReference>
      <ram:SellerTradeParty>
        <ram:Name>Test Lieferant GmbH</ram:Name>
      </ram:SellerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>DE89370400440532013000</ram:IBANID>
        </ram:PayeePartyCreditorFinancialAccount>
      </ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">20260520</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:TaxBasisTotalAmount>1000.00</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount>190.00</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>1190.00</ram:GrandTotalAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

// ---------------------------------------------------------------------------
// Fixture: UBL 2.1 — typisch XRechnung-Standard
// ---------------------------------------------------------------------------
const UBL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <ID>UBL-RE-99</ID>
  <IssueDate>2026-04-20</IssueDate>
  <DueDate>2026-05-20</DueDate>
  <BuyerReference>PROJ-UBL</BuyerReference>
  <AccountingSupplierParty>
    <Party>
      <PartyName>
        <Name>UBL Test Lieferant</Name>
      </PartyName>
    </Party>
  </AccountingSupplierParty>
  <PaymentMeans>
    <PayeeFinancialAccount>
      <ID>DE12500105170648489890</ID>
    </PayeeFinancialAccount>
  </PaymentMeans>
  <TaxTotal>
    <TaxAmount>190.00</TaxAmount>
  </TaxTotal>
  <LegalMonetaryTotal>
    <TaxExclusiveAmount>1000.00</TaxExclusiveAmount>
    <PayableAmount>1190.00</PayableAmount>
  </LegalMonetaryTotal>
</Invoice>`;

// CII ohne BuyerReference — Fallback auf InvoiceNumber als bestellnummer
const CII_OHNE_BUYER_REF = CII_XML.replace(
  /<ram:BuyerReference>PROJ-2026-A<\/ram:BuyerReference>/,
  "",
);

// CII ohne GrandTotal — sollte null returnen (Pflichtfeld)
const CII_OHNE_TOTAL = CII_XML.replace(/<ram:GrandTotalAmount>1190\.00<\/ram:GrandTotalAmount>/, "");

const NICHT_E_RECHNUNG_XML = `<?xml version="1.0"?><sometag>random data</sometag>`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("parseXRechnung — CII (UN/CEFACT)", () => {
  it("extrahiert alle BT-Felder aus CII-XML", () => {
    const result = parseXRechnung(CII_XML);
    expect(result).not.toBeNull();
    expect(result!.typ).toBe("rechnung");
    expect(result!.bestellnummer).toBe("PROJ-2026-A"); // BuyerReference (BT-13)
    expect(result!.haendler).toBe("Test Lieferant GmbH");
    expect(result!.datum).toBe("2026-04-20");
    expect(result!.faelligkeitsdatum).toBe("2026-05-20");
    expect(result!.gesamtbetrag).toBe(1190);
    expect(result!.netto).toBe(1000);
    expect(result!.mwst).toBe(190);
    expect(result!.iban).toBe("DE89370400440532013000");
    expect(result!.konfidenz).toBe(1.0);
    expect(result!.volltext).toContain("RE-CII-12345");
  });

  it("Fallback: ohne BuyerReference nimmt InvoiceNumber als bestellnummer", () => {
    const result = parseXRechnung(CII_OHNE_BUYER_REF);
    expect(result).not.toBeNull();
    expect(result!.bestellnummer).toBe("RE-CII-12345");
  });

  it("Pflichtfeld-Check: ohne Invoice-Total → null", () => {
    const result = parseXRechnung(CII_OHNE_TOTAL);
    expect(result).toBeNull();
  });
});

describe("parseXRechnung — UBL 2.1", () => {
  it("extrahiert alle BT-Felder aus UBL-XML", () => {
    const result = parseXRechnung(UBL_XML);
    expect(result).not.toBeNull();
    expect(result!.typ).toBe("rechnung");
    expect(result!.bestellnummer).toBe("PROJ-UBL");
    expect(result!.haendler).toBe("UBL Test Lieferant");
    expect(result!.datum).toBe("2026-04-20");
    expect(result!.faelligkeitsdatum).toBe("2026-05-20");
    expect(result!.gesamtbetrag).toBe(1190);
    expect(result!.netto).toBe(1000);
    expect(result!.mwst).toBe(190);
    expect(result!.iban).toBe("DE12500105170648489890");
    expect(result!.konfidenz).toBe(1.0);
  });
});

describe("parseXRechnung — Negativ-Tests", () => {
  it("liefert null bei nicht-e-rechnung XML", () => {
    expect(parseXRechnung(NICHT_E_RECHNUNG_XML)).toBeNull();
  });

  it("liefert null bei kaputtem XML", () => {
    expect(parseXRechnung("<unclosed>")).toBeNull();
    expect(parseXRechnung("garbage not xml")).toBeNull();
    expect(parseXRechnung("")).toBeNull();
  });
});

describe("extractEInvoiceXml — Anhang-Detection", () => {
  it("liefert XML aus direktem XML-Anhang (CII)", async () => {
    const result = await extractEInvoiceXml({
      name: "factur-x.xml",
      mime_type: "application/xml",
      base64: Buffer.from(CII_XML, "utf-8").toString("base64"),
    });
    expect(result).not.toBeNull();
    expect(result).toContain("CrossIndustryInvoice");
  });

  it("liefert XML aus UBL-Anhang", async () => {
    const result = await extractEInvoiceXml({
      name: "xrechnung.xml",
      mime_type: "text/xml",
      base64: Buffer.from(UBL_XML, "utf-8").toString("base64"),
    });
    expect(result).not.toBeNull();
    expect(result).toContain("ubl:schema");
  });

  it("liefert null bei XML ohne E-Rechnung-Marker", async () => {
    const result = await extractEInvoiceXml({
      name: "irrelevant.xml",
      mime_type: "application/xml",
      base64: Buffer.from(NICHT_E_RECHNUNG_XML, "utf-8").toString("base64"),
    });
    expect(result).toBeNull();
  });

  it("liefert null bei nicht-XML/nicht-PDF Anhang", async () => {
    const result = await extractEInvoiceXml({
      name: "image.jpg",
      mime_type: "image/jpeg",
      base64: "garbage",
    });
    expect(result).toBeNull();
  });

  it("Filename-Endung .xml wird auch ohne MIME-Type erkannt", async () => {
    const result = await extractEInvoiceXml({
      name: "Rechnung.xml",
      mime_type: "application/octet-stream", // M365 sendet manchmal so
      base64: Buffer.from(CII_XML, "utf-8").toString("base64"),
    });
    expect(result).not.toBeNull();
  });

  it("PDF ohne ZUGFeRD-Embed → null (nicht crashen)", async () => {
    // Minimal-PDF (kein gültiges, aber pdf-lib fängt das ab)
    const dummyPdf = Buffer.from("not a real pdf").toString("base64");
    const result = await extractEInvoiceXml({
      name: "rechnung.pdf",
      mime_type: "application/pdf",
      base64: dummyPdf,
    });
    expect(result).toBeNull();
  });
});

describe("tryParseEInvoiceFromAttachments — High-Level", () => {
  it("findet erste E-Rechnung in einer Liste von Anhängen", async () => {
    const result = await tryParseEInvoiceFromAttachments([
      {
        name: "irrelevant.jpg",
        mime_type: "image/jpeg",
        base64: "garbage",
      },
      {
        name: "factur-x.xml",
        mime_type: "application/xml",
        base64: Buffer.from(CII_XML, "utf-8").toString("base64"),
      },
    ]);
    expect(result).not.toBeNull();
    expect(result!.bestellnummer).toBe("PROJ-2026-A");
    expect(result!.konfidenz).toBe(1.0);
  });

  it("liefert null wenn keine E-Rechnung dabei", async () => {
    const result = await tryParseEInvoiceFromAttachments([
      { name: "image.jpg", mime_type: "image/jpeg", base64: "x" },
      { name: "doc.txt", mime_type: "text/plain", base64: "x" },
    ]);
    expect(result).toBeNull();
  });

  it("liefert null bei leerer Liste", async () => {
    const result = await tryParseEInvoiceFromAttachments([]);
    expect(result).toBeNull();
  });
});

/**
 * 30.09.2026 — ZUGFeRD-PDFs. Der Zweig war seit dem ersten Tag tot
 * (`pdfDoc.getAttachments()` gibt es in pdf-lib nicht), was in sechs
 * Monaten niemandem auffiel, weil er still nichts lieferte statt zu
 * scheitern. Diese Tests bauen echte PDFs und pruefen den ganzen Weg.
 */
describe("extractEInvoiceXml — ZUGFeRD im PDF", () => {
  const CII = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100">
  <rsm:ExchangedDocument><ram:ID>RE-4711</ram:ID></rsm:ExchangedDocument>
</rsm:CrossIndustryInvoice>`;

  async function pdfMitAnhang(
    eintraege: Array<{ name: string; inhalt: string }>,
  ): Promise<string> {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    for (const e of eintraege) {
      await doc.attach(Buffer.from(e.inhalt, "utf-8"), e.name, { mimeType: "application/xml" });
    }
    return Buffer.from(await doc.save()).toString("base64");
  }

  it("liest die eingebettete XML aus einem ZUGFeRD-PDF", async () => {
    const base64 = await pdfMitAnhang([{ name: "factur-x.xml", inhalt: CII }]);
    const xml = await extractEInvoiceXml({
      name: "Rechnung_2026_09.pdf",
      mime_type: "application/pdf",
      base64,
    });
    expect(xml).toContain("CrossIndustryInvoice");
  });

  it("findet die Rechnung auch unter einem unueblichen Dateinamen", async () => {
    // Der Name ist nicht streng genormt — verworfen wird am Inhalt.
    const base64 = await pdfMitAnhang([{ name: "beleg_2026.xml", inhalt: CII }]);
    const xml = await extractEInvoiceXml({
      name: "Rechnung.pdf",
      mime_type: "application/pdf",
      base64,
    });
    expect(xml).toContain("CrossIndustryInvoice");
  });

  it("ignoriert eingebettete Dateien, die keine E-Rechnung sind", async () => {
    const base64 = await pdfMitAnhang([
      { name: "lieferhinweis.xml", inhalt: "<hinweis>Ware kommt Montag</hinweis>" },
    ]);
    const xml = await extractEInvoiceXml({
      name: "Rechnung.pdf",
      mime_type: "application/pdf",
      base64,
    });
    expect(xml).toBeNull();
  });

  it("nimmt die echte Rechnung, wenn noch andere Dateien im PDF stecken", async () => {
    const base64 = await pdfMitAnhang([
      { name: "agb.xml", inhalt: "<agb>Zahlbar sofort</agb>" },
      { name: "factur-x.xml", inhalt: CII },
    ]);
    const xml = await extractEInvoiceXml({
      name: "Rechnung.pdf",
      mime_type: "application/pdf",
      base64,
    });
    expect(xml).toContain("CrossIndustryInvoice");
  });

  it("liefert null bei einem PDF ohne eingebettete Datei", async () => {
    const base64 = await pdfMitAnhang([]);
    const xml = await extractEInvoiceXml({
      name: "Rechnung.pdf",
      mime_type: "application/pdf",
      base64,
    });
    expect(xml).toBeNull();
  });
});
