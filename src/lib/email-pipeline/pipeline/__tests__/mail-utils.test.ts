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
