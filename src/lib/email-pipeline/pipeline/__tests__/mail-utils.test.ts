/**
 * mail-utils Tests — Pure Helper-Functions der Pipeline.
 *
 * Sicherheitskritisch: stripHtml mit Dangerous-Protocol-Neutralisierung
 * (F3.F8), safeBase64ToBuffer gegen Garbage-Inputs.
 *
 * Plus: extractEmailAddress / extractDomain — Foundation für ALLES (jeder
 * Vendor-Parser-Match-Check, alle Domain-Filter). Bug hier = Pipeline-Cascade.
 */

import { describe, it, expect } from "vitest";
import {
  effectiveMimeType,
  extractEmailAddress,
  extractDomain,
  isIrrelevantDomain,
  isVersandDomain,
  safeBase64ToBuffer,
  stripHtml,
  htmlToStructuredText,
  isVersandBetreff,
  isBestellBetreff,
} from "../mail-utils";

describe("effectiveMimeType — PDF-Alias-Normalisierung", () => {
  it("normalisiert pdf-Aliase mit .pdf-Endung zu application/pdf", () => {
    expect(effectiveMimeType("application/pdfa", "Rechnung.pdf")).toBe("application/pdf");
    expect(effectiveMimeType("application/x-pdf", "Doc.pdf")).toBe("application/pdf");
    expect(effectiveMimeType("application/octet-stream", "Test.PDF")).toBe("application/pdf");
  });

  it("normalisiert image/jpg zu image/jpeg (Standard-Konformität)", () => {
    expect(effectiveMimeType("image/jpg", "foto.jpg")).toBe("image/jpeg");
  });

  it("lässt korrektes MIME unverändert", () => {
    expect(effectiveMimeType("application/pdf", "doc.pdf")).toBe("application/pdf");
    expect(effectiveMimeType("image/png", "shot.png")).toBe("image/png");
  });

  it("octet-stream OHNE .pdf-Endung bleibt octet-stream", () => {
    // Magic-Byte-Check entscheidet später separat
    expect(effectiveMimeType("application/octet-stream", "trojan.exe")).toBe("application/octet-stream");
  });
});

describe("extractEmailAddress + extractDomain — Foundation für alle Vendor-Parser", () => {
  it("extrahiert pure E-Mail aus 'Display <addr>'-Format", () => {
    expect(extractEmailAddress("Tanja Santl <tanja.santl@hold-spada.com>")).toBe("tanja.santl@hold-spada.com");
    expect(extractEmailAddress("Microsoft <microsoft-noreply@microsoft.com>")).toBe("microsoft-noreply@microsoft.com");
  });

  it("akzeptiert pure E-Mail ohne Display-Name", () => {
    expect(extractEmailAddress("info@fasp.de")).toBe("info@fasp.de");
  });

  it("liefert leeren String für leere Input", () => {
    expect(extractEmailAddress("")).toBe("");
  });

  it("normalisiert auf Lowercase", () => {
    expect(extractEmailAddress("Test@Example.COM")).toBe("test@example.com");
  });

  it("extractDomain liefert nur Domain-Teil", () => {
    expect(extractDomain("info@fasp.de")).toBe("fasp.de");
    expect(extractDomain("Tanja <tanja@hold-spada.com>")).toBe("hold-spada.com");
    expect(extractDomain("ohne-at-zeichen")).toBe(""); // kein @ → keine Domain
  });

  it("subdomains bleiben erhalten", () => {
    expect(extractDomain("user@email.shopify.com")).toBe("email.shopify.com");
  });
});

describe("isVersandDomain + isIrrelevantDomain — Domain-Filter", () => {
  it("erkennt typische Versand-Domains (DHL/DPD)", () => {
    expect(isVersandDomain("dhl.com")).toBe(true);
    expect(isVersandDomain("dhl.de")).toBe(true);
    expect(isVersandDomain("dpd.de")).toBe(true);
  });

  it("erkennt Subdomain von Versand-Domain", () => {
    // Wenn dhl.com in der Liste ist, soll noreply.dhl.com auch matchen
    expect(isVersandDomain("noreply.dhl.com")).toBe(true);
  });

  it("Vendor-Domains sind keine Versand-Domains", () => {
    expect(isVersandDomain("hold-spada.com")).toBe(false);
    expect(isVersandDomain("fasp.de")).toBe(false);
    expect(isVersandDomain("rexel.de")).toBe(false);
  });
});

describe("safeBase64ToBuffer — Garbage-Schutz (F3.F7)", () => {
  it("liefert null bei leerem/zu kurzem Input", () => {
    expect(safeBase64ToBuffer("")).toBe(null);
    expect(safeBase64ToBuffer("AAAA")).toBe(null); // <64 chars
  });

  it("liefert null bei null/undefined", () => {
    // @ts-expect-error testing runtime defense
    expect(safeBase64ToBuffer(null)).toBe(null);
    // @ts-expect-error testing runtime defense
    expect(safeBase64ToBuffer(undefined)).toBe(null);
  });

  it("liefert Buffer bei validem base64", () => {
    const realData = Buffer.alloc(200, 0xFF).toString("base64");
    const result = safeBase64ToBuffer(realData);
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThanOrEqual(50);
  });

  it("liefert null bei Buffer < 50 bytes (zu klein für PDF/Bild)", () => {
    const tiny = Buffer.alloc(20).toString("base64") + "Padding".repeat(20); // base64 hat min 64 chars aber decoded zu wenig
    const result = safeBase64ToBuffer(tiny);
    // Buffer-Length ist hier zu klein OR sanity-check schlägt
    expect(result === null || (result.length >= 50)).toBe(true);
  });
});

describe("stripHtml — XSS-Schutz + Dangerous-Protocols (F3.F8)", () => {
  it("entfernt simple Tags", () => {
    expect(stripHtml("<p>Hallo</p>")).toBe("Hallo");
    expect(stripHtml("<div>Text</div>")).toBe("Text");
  });

  it("entfernt <script> und <style> komplett (Inhalt + Tag)", () => {
    const result = stripHtml("Vorher<script>alert('xss')</script>Nachher");
    expect(result).not.toContain("alert");
    expect(result).not.toContain("xss");
    expect(result).toContain("Vorher");
    expect(result).toContain("Nachher");
  });

  it("neutralisiert javascript: Protokoll im Plain-Text-Kontext", () => {
    // HTML-Tags werden zuerst gestrippt — javascript: in href-Attributen
    // verschwindet bereits als Teil des Tags. Der Dangerous-Protocols-Replace
    // greift nur wenn das Protokoll als Plain-Text durchrutscht.
    const result = stripHtml("Klick javascript:alert(1) zum Spaß");
    expect(result).not.toContain("javascript:alert");
    expect(result).toContain("[blocked-protocol]:");
  });

  it("neutralisiert vbscript: Protokoll", () => {
    const result = stripHtml("Run vbscript:Execute('bad')");
    expect(result).not.toContain("vbscript:Execute");
    expect(result).toContain("[blocked-protocol]:");
  });

  it("neutralisiert data: Protokoll (Data-URI XSS)", () => {
    const result = stripHtml("Href data:text/html,<script>alert(1)</script>");
    expect(result).toContain("[blocked-protocol]:");
  });

  it("neutralisiert file: + jar: Protokolle", () => {
    expect(stripHtml("file:///etc/passwd")).toContain("[blocked-protocol]:");
    expect(stripHtml("jar:archive!/data")).toContain("[blocked-protocol]:");
  });

  it("dekodiert HTML-Entities", () => {
    expect(stripHtml("&amp;")).toBe("&");
    expect(stripHtml("&lt;Tag&gt;")).toBe("<Tag>");
  });

  it("liefert leeren String für null/undefined", () => {
    // @ts-expect-error testing runtime defense
    expect(stripHtml(null)).toBe("");
    // @ts-expect-error testing runtime defense
    expect(stripHtml(undefined)).toBe("");
  });
});

describe("htmlToStructuredText — Tabellen-Erhalt für KI-Body-Vorbereitung", () => {
  it("liefert leeren String für null/undefined/leer", () => {
    // @ts-expect-error testing runtime defense
    expect(htmlToStructuredText(null)).toBe("");
    // @ts-expect-error testing runtime defense
    expect(htmlToStructuredText(undefined)).toBe("");
    expect(htmlToStructuredText("")).toBe("");
  });

  it("normalisiert Plain-Text-Mails ohne HTML-Tags", () => {
    const plain = "Hallo,\n\ndas ist eine Plain-Text-Mail.\n\nGruß";
    const result = htmlToStructuredText(plain);
    expect(result).toContain("Hallo");
    expect(result).toContain("Plain-Text-Mail");
    expect(result).toContain("Gruß");
  });

  it("entfernt <script> und <style> komplett", () => {
    const html = "<div>Vorher<script>alert('xss')</script>Nachher</div><style>.x{color:red}</style>";
    const result = htmlToStructuredText(html);
    expect(result).not.toContain("alert");
    expect(result).not.toContain("xss");
    expect(result).not.toContain("color:red");
    expect(result).toContain("Vorher");
    expect(result).toContain("Nachher");
  });

  it("bewahrt Tabellen-Struktur mit ` | ` zwischen Cells", () => {
    const html = `
      <table>
        <tr><th>Produkt</th><th>Menge</th><th>Brutto</th></tr>
        <tr><td>Bohrmaschine</td><td>2</td><td>179,98 €</td></tr>
        <tr><td>Akkuschrauber</td><td>1</td><td>89,90 €</td></tr>
      </table>
    `;
    const result = htmlToStructuredText(html);
    expect(result).toContain("Produkt | Menge | Brutto");
    expect(result).toContain("Bohrmaschine | 2 | 179,98 €");
    expect(result).toContain("Akkuschrauber | 1 | 89,90 €");
  });

  it("Block-Elemente werden zu Newlines (Amazon-BB-typisch)", () => {
    const html = "<p>Ihre Amazon.de Bestellung</p><div>Bestellsumme: 50,14 €</div><p>Lieferadresse: ...</p>";
    const result = htmlToStructuredText(html);
    const lines = result.split("\n").map((l) => l.trim()).filter(Boolean);
    expect(lines).toContain("Ihre Amazon.de Bestellung");
    expect(lines).toContain("Bestellsumme: 50,14 €");
    expect(lines).toContain("Lieferadresse: ...");
  });

  it("dekodiert HTML-Entities (&euro;, &nbsp;, &amp;, &#8364;)", () => {
    expect(htmlToStructuredText("Preis: 50&euro;")).toContain("Preis: 50€");
    expect(htmlToStructuredText("&amp;")).toContain("&");
    expect(htmlToStructuredText("Preis: 100&#8364;")).toContain("Preis: 100€");
    expect(htmlToStructuredText("Datum:&nbsp;01.01.2026")).toContain("Datum: 01.01.2026");
  });

  it("dekodiert deutsche Umlaute via named entities", () => {
    expect(htmlToStructuredText("Schl&ouml;sser &amp; Gr&uuml;&szlig;e")).toContain("Schlösser & Grüße");
  });

  it("neutralisiert Dangerous-Protocols", () => {
    const result = htmlToStructuredText("<p>Klick javascript:alert(1) hier</p>");
    expect(result).not.toContain("javascript:alert");
    expect(result).toContain("[blocked-protocol]:");
  });

  it("Listen werden zu Bullet-Points", () => {
    const html = "<ul><li>Erste Position</li><li>Zweite Position</li></ul>";
    const result = htmlToStructuredText(html);
    expect(result).toContain("• Erste Position");
    expect(result).toContain("• Zweite Position");
  });

  it("normalisiert Whitespace ohne Beträge zu zerstören", () => {
    const html = "<p>Brutto:    1.999,30  €</p>";
    const result = htmlToStructuredText(html);
    expect(result).toContain("Brutto: 1.999,30 €");
  });

  it("Multi-Newlines werden auf max 2 reduziert", () => {
    const html = "<p>A</p><br><br><br><br><p>B</p>";
    const result = htmlToStructuredText(html);
    expect(result).not.toMatch(/\n{3,}/);
    expect(result).toContain("A");
    expect(result).toContain("B");
  });

  it("reale Amazon-BB Tabelle: Beträge bleiben spaltenweise zuordbar", () => {
    const html = `
      <table>
        <tr><td>Zwischensumme:</td><td>42,14&nbsp;€</td></tr>
        <tr><td>Versand:</td><td>0,00&nbsp;€</td></tr>
        <tr><td><strong>Gesamtsumme:</strong></td><td><strong>50,14&nbsp;€</strong></td></tr>
      </table>
    `;
    const result = htmlToStructuredText(html);
    expect(result).toContain("Zwischensumme: | 42,14 €");
    expect(result).toContain("Gesamtsumme: | 50,14 €");
  });

  it("entfernt <head>-Block samt Meta-Tags", () => {
    const html = "<html><head><meta charset='utf-8'><title>RG</title></head><body>Inhalt</body></html>";
    const result = htmlToStructuredText(html);
    expect(result).not.toContain("meta charset");
    expect(result).not.toContain("<title>");
    expect(result).toContain("Inhalt");
  });
});

describe("isVersandBetreff — Subject-Klassifikation für Versand", () => {
  it("erkennt deutsche Versand-Begriffe", () => {
    expect(isVersandBetreff("Versandbestätigung Ihrer Bestellung")).toBe(true);
    expect(isVersandBetreff("Ihr Paket wurde versendet")).toBe(true);
    expect(isVersandBetreff("Sendungsverfolgung 12345")).toBe(true);
    expect(isVersandBetreff("Bestellung wird zugestellt")).toBe(true); // matched "wird zugestellt"
    expect(isVersandBetreff("Ist unterwegs")).toBe(true);
    expect(isVersandBetreff("Paket auf dem Weg")).toBe(true);
  });

  it("erkennt englische Versand-Begriffe", () => {
    expect(isVersandBetreff("Your order has been shipped")).toBe(true);
    expect(isVersandBetreff("Out for delivery")).toBe(true);
    expect(isVersandBetreff("Has been delivered")).toBe(true);
  });

  it("Bestellbestätigung wird NICHT als Versand klassifiziert", () => {
    expect(isVersandBetreff("Bestellbestätigung 12345")).toBe(false);
    expect(isVersandBetreff("Auftragsbestätigung")).toBe(false);
    expect(isVersandBetreff("Order confirmation")).toBe(false);
  });

  it("case-insensitive", () => {
    expect(isVersandBetreff("VERSANDBESTÄTIGUNG")).toBe(true);
    expect(isVersandBetreff("shipped")).toBe(true);
  });
});

describe("isBestellBetreff — Subject-Klassifikation für Bestellung", () => {
  it("erkennt deutsche + englische Bestellbegriffe", () => {
    expect(isBestellBetreff("Bestellbestätigung")).toBe(true);
    expect(isBestellBetreff("Auftragsbestätigung")).toBe(true);
    expect(isBestellBetreff("Order confirmation")).toBe(true);
    expect(isBestellBetreff("Ihre Bestellung 123")).toBe(true);
    expect(isBestellBetreff("Rechnung Nr. 456")).toBe(true);
  });

  it("Versand wird NICHT als Bestellung klassifiziert", () => {
    expect(isBestellBetreff("Sendungsverfolgung")).toBe(false);
    expect(isBestellBetreff("Out for delivery")).toBe(false);
  });
});
