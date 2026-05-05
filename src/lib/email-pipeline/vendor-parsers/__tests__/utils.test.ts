/**
 * Vendor-Parser-Utils Tests.
 *
 * Pipeline-kritisch: parseEuroAmount + parseGermanDate werden von vielen
 * Parsern + run.ts-Body-Pattern-Fallbacks verwendet. Falsche Parsing-Logik
 * würde stille Daten-Korruption in DB schreiben (Beträge als String, falsches
 * Datum, etc).
 */

import { describe, it, expect } from "vitest";
import { parseGermanDate, parseEuroAmount, stripHtmlToText } from "../utils";

describe("parseGermanDate", () => {
  it("parst ISO direkt", () => {
    expect(parseGermanDate("2026-04-20")).toBe("2026-04-20");
    expect(parseGermanDate("2026-4-5")).toBe("2026-04-05"); // padding
  });

  it("parst DD.MM.YYYY (deutsches Format)", () => {
    expect(parseGermanDate("20.04.2026")).toBe("2026-04-20");
    expect(parseGermanDate("5.4.2026")).toBe("2026-04-05");
  });

  it("parst DD/MM/YYYY", () => {
    expect(parseGermanDate("20/04/2026")).toBe("2026-04-20");
  });

  it("parst Langform '16. April 2026'", () => {
    expect(parseGermanDate("16. April 2026")).toBe("2026-04-16");
    expect(parseGermanDate("16.April 2026")).toBe("2026-04-16");
    expect(parseGermanDate("1. März 2026")).toBe("2026-03-01");
    expect(parseGermanDate("31. Dezember 2026")).toBe("2026-12-31");
  });

  it("parst Kurzformen 'Mär', 'Sep', 'Dez'", () => {
    expect(parseGermanDate("16. Mar 2026")).toBe("2026-03-16");
    expect(parseGermanDate("15. Sep 2026")).toBe("2026-09-15");
    expect(parseGermanDate("31. Dez 2026")).toBe("2026-12-31");
  });

  it("liefert null bei nicht-parsebaren Werten", () => {
    expect(parseGermanDate(null)).toBe(null);
    expect(parseGermanDate(undefined)).toBe(null);
    expect(parseGermanDate("")).toBe(null);
    expect(parseGermanDate("morgen")).toBe(null);
    expect(parseGermanDate("Quatsch")).toBe(null);
  });
});

describe("parseEuroAmount — deutsche Format-Konvention", () => {
  it("parst deutsches Format mit Komma", () => {
    expect(parseEuroAmount("234,99")).toBe(234.99);
    expect(parseEuroAmount("0,50")).toBe(0.5);
  });

  it("parst Tausenderpunkt + Komma (1.234,56)", () => {
    expect(parseEuroAmount("1.234,56")).toBe(1234.56);
    expect(parseEuroAmount("12.345,67")).toBe(12345.67);
    expect(parseEuroAmount("1.234.567,89")).toBe(1234567.89);
  });

  it("entfernt Währungs-Suffix/Prefix", () => {
    expect(parseEuroAmount("234,99 €")).toBe(234.99);
    expect(parseEuroAmount("EUR 234,99")).toBe(234.99);
    expect(parseEuroAmount("€ 1.234,56")).toBe(1234.56);
  });

  it("liefert null bei Müll", () => {
    expect(parseEuroAmount(null)).toBe(null);
    expect(parseEuroAmount("")).toBe(null);
    expect(parseEuroAmount("kostenlos")).toBe(null);
    expect(parseEuroAmount("€")).toBe(null);
  });

  it("0,00 wird als 0 zurückgegeben (NICHT als null)", () => {
    expect(parseEuroAmount("0,00")).toBe(0);
    expect(parseEuroAmount("0")).toBe(0);
  });
});

describe("stripHtmlToText", () => {
  it("entfernt simple Tags", () => {
    expect(stripHtmlToText("<p>Hallo</p>")).toBe("Hallo");
    expect(stripHtmlToText("<div>Test</div>")).toContain("Test");
  });

  it("ersetzt <br> und Block-Endungen mit Newlines", () => {
    const result = stripHtmlToText("Zeile 1<br>Zeile 2<br/>Zeile 3");
    expect(result).toContain("Zeile 1");
    expect(result).toContain("Zeile 2");
    expect(result).toContain("Zeile 3");
    expect(result.split("\n").length).toBeGreaterThanOrEqual(3);
  });

  it("entfernt <script> und <style> Inhalte komplett (XSS-Schutz)", () => {
    const result = stripHtmlToText("Text<script>alert('xss')</script>Mehr");
    expect(result).not.toContain("alert");
    expect(result).not.toContain("xss");
  });

  it("dekodiert HTML-Entities", () => {
    expect(stripHtmlToText("&amp;")).toBe("&");
    expect(stripHtmlToText("&lt;Tag&gt;")).toBe("<Tag>");
    expect(stripHtmlToText("&nbsp;Text")).toContain("Text");
    expect(stripHtmlToText("&quot;zitat&quot;")).toBe('"zitat"');
  });

  it("trimmt + kollabiert mehrfache Spaces", () => {
    const result = stripHtmlToText("  <p>  multi    space  </p>  ");
    expect(result).toBe("multi space");
  });

  it("liefert leeren String bei null/undefined", () => {
    expect(stripHtmlToText(null)).toBe("");
    expect(stripHtmlToText(undefined)).toBe("");
    expect(stripHtmlToText("")).toBe("");
  });
});
