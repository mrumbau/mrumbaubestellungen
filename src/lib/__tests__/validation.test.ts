/**
 * Validation-Suite Tests.
 *
 * Fokus: safeBestellnummer mit Halluzinations-Blocklist (Pipeline-kritisch —
 * verhindert dass GPT-Halluzinationen wie "verschicken" als Bestellnummer
 * in die DB landen, siehe email_pipeline_hardening_2026_05.md).
 */

import { describe, it, expect } from "vitest";
import {
  isValidUUID,
  isAllowedMimeType,
  isValidDomain,
  isValidKuerzel,
  safeBestellnummer,
  sanitizePlainText,
  sanitizeFilename,
} from "../validation";

describe("isValidUUID", () => {
  it("akzeptiert gültige UUID v4", () => {
    expect(isValidUUID("a725e7b7-84e4-4f67-80d5-ea8e3d69e7a4")).toBe(true);
  });

  it("verwirft Müll", () => {
    expect(isValidUUID("not-a-uuid")).toBe(false);
    expect(isValidUUID("")).toBe(false);
    expect(isValidUUID("12345")).toBe(false);
  });
});

describe("isAllowedMimeType", () => {
  it("akzeptiert PDF + JPEG + PNG + WebP", () => {
    expect(isAllowedMimeType("application/pdf")).toBe(true);
    expect(isAllowedMimeType("image/jpeg")).toBe(true);
    expect(isAllowedMimeType("image/png")).toBe(true);
    expect(isAllowedMimeType("image/webp")).toBe(true);
  });

  it("verwirft SVG (XSS-Risiko)", () => {
    expect(isAllowedMimeType("image/svg+xml")).toBe(false);
  });

  it("verwirft executables", () => {
    expect(isAllowedMimeType("application/x-msdownload")).toBe(false);
    expect(isAllowedMimeType("application/zip")).toBe(false);
    expect(isAllowedMimeType("text/html")).toBe(false);
  });

  it("akzeptiert octet-stream (M365 sendet PDFs gelegentlich so — Magic-Bytes filtern später)", () => {
    expect(isAllowedMimeType("application/octet-stream")).toBe(true);
  });
});

describe("isValidDomain", () => {
  it("akzeptiert normale Domains", () => {
    expect(isValidDomain("example.com")).toBe(true);
    expect(isValidDomain("sub.example.de")).toBe(true);
    expect(isValidDomain("hold-spada.com")).toBe(true);
  });

  it("verwirft ungültige Strings", () => {
    expect(isValidDomain("")).toBe(false);
    expect(isValidDomain("no-tld")).toBe(false);
    expect(isValidDomain("space in.domain")).toBe(false);
  });
});

describe("isValidKuerzel", () => {
  it("akzeptiert 2-5 Buchstaben groß", () => {
    expect(isValidKuerzel("MT")).toBe(true);
    expect(isValidKuerzel("CR")).toBe(true);
    expect(isValidKuerzel("MH")).toBe(true);
    expect(isValidKuerzel("NJ")).toBe(true);
    expect(isValidKuerzel("ABCDE")).toBe(true); // 5 Buchstaben erlaubt
  });

  it("verwirft Kleinbuchstaben + zu lang/zu kurz + Digits", () => {
    expect(isValidKuerzel("mt")).toBe(false);
    expect(isValidKuerzel("M")).toBe(false);
    expect(isValidKuerzel("ABCDEF")).toBe(false); // 6+ raus
    expect(isValidKuerzel("M1")).toBe(false);
  });
});

describe("safeBestellnummer — Halluzinations-Schutz", () => {
  it("akzeptiert reguläre Bestellnummern", () => {
    expect(safeBestellnummer("123456")).toBe("123456");
    expect(safeBestellnummer("305-1234567-1234567")).toBe("305-1234567-1234567");
    expect(safeBestellnummer("AUF1234567")).toBe("AUF1234567");
    expect(safeBestellnummer("RE012")).toBe("RE012");
    expect(safeBestellnummer("CBEPFVF")).toBe(null); // KEIN Digit → reject
    expect(safeBestellnummer("CB1PFVF")).toBe("CB1PFVF"); // mit Digit → ok
  });

  it("verwirft Halluzinations-Wörter (BLOCKLIST)", () => {
    expect(safeBestellnummer("verschicken")).toBe(null);
    expect(safeBestellnummer("Verschicken")).toBe(null); // case-insensitive
    expect(safeBestellnummer("wurden")).toBe(null);
    expect(safeBestellnummer("rechnung")).toBe(null);
    expect(safeBestellnummer("unbekannt")).toBe(null);
    expect(safeBestellnummer("unknown")).toBe(null);
    expect(safeBestellnummer("null")).toBe(null);
    expect(safeBestellnummer("n/a")).toBe(null);
  });

  it("verwirft zu kurze und zu lange Werte", () => {
    expect(safeBestellnummer("123")).toBe(null);
    expect(safeBestellnummer("12")).toBe(null);
    expect(safeBestellnummer("a".repeat(61))).toBe(null);
  });

  it("verwirft Werte ohne mindestens 1 Digit", () => {
    expect(safeBestellnummer("ABCDEF")).toBe(null);
    expect(safeBestellnummer("Lorem ipsum")).toBe(null);
    expect(safeBestellnummer("Bestellung")).toBe(null);
  });

  it("verwirft non-string-Inputs", () => {
    expect(safeBestellnummer(null)).toBe(null);
    expect(safeBestellnummer(undefined)).toBe(null);
    expect(safeBestellnummer(123)).toBe(null);
    expect(safeBestellnummer({})).toBe(null);
    expect(safeBestellnummer([])).toBe(null);
  });

  it("trimmt Leerzeichen", () => {
    expect(safeBestellnummer("  AUF1234567  ")).toBe("AUF1234567");
  });
});

describe("sanitizeFilename", () => {
  it("ersetzt Sonderzeichen aber behält Buchstaben/Zahlen/Bindestrich", () => {
    const result = sanitizeFilename("Rechnung-123_test.pdf");
    expect(result).toBeTruthy();
    expect(result).not.toContain("/");
    expect(result).not.toContain("\\");
  });
});

describe("sanitizePlainText — User-Input-Schutz (XSS)", () => {
  it("entfernt HTML-Tags", () => {
    const result = sanitizePlainText("Hallo <script>alert(1)</script> Welt");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("</script>");
  });

  it("kürzt auf maxLen", () => {
    const result = sanitizePlainText("a".repeat(5000), 100);
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it("erhält normalen Text", () => {
    const text = "Bitte um Freigabe — Bestellung dringend.";
    const result = sanitizePlainText(text);
    expect(result).toContain("Freigabe");
    expect(result).toContain("Bestellung");
  });
});
