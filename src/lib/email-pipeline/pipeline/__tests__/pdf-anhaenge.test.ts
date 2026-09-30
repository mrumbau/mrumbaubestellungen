/**
 * Rundlauf-Test fuer das Lesen eingebetteter PDF-Dateien.
 *
 * Der Vorgaenger rief `pdfDoc.getAttachments()` auf — eine Methode, die es
 * in pdf-lib nicht gibt. Abgesichert mit `?.() ?? []` sah der Code gesund
 * aus und lieferte still immer nichts, sechs Monate lang. Genau deshalb
 * baut dieser Test ein echtes PDF mit Anhang und holt ihn wieder heraus,
 * statt eine Bibliotheksfunktion zu mocken: ein Mock haette den Fehler
 * nachgebaut statt ihn zu finden.
 */
import { describe, it, expect } from "vitest";
import { PDFDocument, AFRelationship, PDFName } from "pdf-lib";
import { ladeEingebetteteDateien } from "../pdf-anhaenge";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100">
  <rsm:ExchangedDocument><ram:ID>RE-4711</ram:ID></rsm:ExchangedDocument>
</rsm:CrossIndustryInvoice>`;

async function baueZugferdPdf(dateiname: string, inhalt: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  await doc.attach(Buffer.from(inhalt, "utf-8"), dateiname, {
    mimeType: "application/xml",
    afRelationship: AFRelationship.Alternative,
  });
  return Buffer.from(await doc.save());
}

describe("ladeEingebetteteDateien", () => {
  it("holt die ZUGFeRD-XML aus einem PDF wieder heraus", async () => {
    const pdf = await baueZugferdPdf("factur-x.xml", XML);
    const dateien = await ladeEingebetteteDateien(pdf);
    expect(dateien).toHaveLength(1);
    expect(dateien[0].name).toBe("factur-x.xml");
    expect(dateien[0].inhalt.toString("utf-8")).toContain("CrossIndustryInvoice");
  });

  it("findet auch mehrere eingebettete Dateien", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    await doc.attach(Buffer.from(XML, "utf-8"), "xrechnung.xml", { mimeType: "application/xml" });
    await doc.attach(Buffer.from("nur Text", "utf-8"), "hinweis.txt", { mimeType: "text/plain" });
    const dateien = await ladeEingebetteteDateien(Buffer.from(await doc.save()));
    expect(dateien.map((d) => d.name).sort()).toEqual(["hinweis.txt", "xrechnung.xml"]);
  });

  it("gibt eine leere Liste fuer ein PDF ohne Anhaenge", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    expect(await ladeEingebetteteDateien(Buffer.from(await doc.save()))).toEqual([]);
  });

  it("wirft nicht, wenn die Datei gar kein PDF ist", async () => {
    expect(await ladeEingebetteteDateien(Buffer.from("das ist kein PDF"))).toEqual([]);
  });

  it("findet die Datei auch, wenn nur /AF gesetzt ist", async () => {
    // Manche Erzeuger tragen die E-Rechnung ausschliesslich unter /AF ein
    // (ZUGFeRD 2.x verlangt den Eintrag) und lassen den /EmbeddedFiles-Baum
    // weg. Hier nachgebaut, indem der Name-Tree nachtraeglich entfernt wird.
    // pdf-lib schreibt den Name-Tree erst beim Speichern. Das PDF wird
    // deshalb einmal gespeichert, neu geladen, der Baum entfernt und erneut
    // gespeichert — danach haengt die Datei nur noch an /AF.
    const erst = await PDFDocument.create();
    erst.addPage([200, 200]);
    await erst.attach(Buffer.from(XML, "utf-8"), "factur-x.xml", {
      mimeType: "application/xml",
      afRelationship: AFRelationship.Alternative,
    });
    const doc = await PDFDocument.load(await erst.save());
    doc.catalog.delete(PDFName.of("Names"));

    const dateien = await ladeEingebetteteDateien(Buffer.from(await doc.save()));
    expect(dateien).toHaveLength(1);
    expect(dateien[0].inhalt.toString("utf-8")).toContain("CrossIndustryInvoice");
  });

  it("behaelt den Inhalt unveraendert, auch bei Umlauten", async () => {
    const text = "Betrag: 1.234,56 € — Grün & Söhne GmbH";
    const pdf = await baueZugferdPdf("factur-x.xml", text);
    const dateien = await ladeEingebetteteDateien(pdf);
    expect(dateien[0].inhalt.toString("utf-8")).toBe(text);
  });
});
