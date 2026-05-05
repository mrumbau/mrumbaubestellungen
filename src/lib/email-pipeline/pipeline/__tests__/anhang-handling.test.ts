/**
 * normalizeAnhaenge Tests — Magic-Byte-Validation + MIME-Filter.
 *
 * Sicherheitskritisch (F3.F1): Make.com / Microsoft Graph senden manche PDFs
 * mit MIME `application/octet-stream`. Ohne Magic-Byte-Check könnte ein
 * Angreifer beliebige Binärdateien (.exe, .zip, .dll) durchschmuggeln und
 * die KI-Pipeline / Storage missbrauchen.
 *
 * Plus: SVG-Ausschluss (XSS-Risiko durch JS in SVG), Inline-Logo-Filter
 * (<5KB), Cross-Check für falsch deklariertes MIME.
 */

import { describe, it, expect } from "vitest";
import { normalizeAnhaenge } from "../anhang-handling";

// ---------------------------------------------------------------------------
// Magic-Byte-Fixtures: korrekte Header für jeden unterstützten Typ
// ---------------------------------------------------------------------------
function makePdfBase64(sizeBytes = 6000): string {
  // %PDF- Header (5 bytes) + Padding auf min 6KB damit nicht als Inline-Bild gefiltert
  const buffer = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(sizeBytes, 0x20)]);
  return buffer.toString("base64");
}

function makeJpegBase64(sizeBytes = 6000): string {
  // JPEG SOI: FF D8 FF E0
  const buffer = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(sizeBytes, 0x00)]);
  return buffer.toString("base64");
}

function makePngBase64(sizeBytes = 6000): string {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const buffer = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    Buffer.alloc(sizeBytes, 0x00),
  ]);
  return buffer.toString("base64");
}

function makeRandomBase64(sizeBytes = 6000): string {
  // Komplett zufällige Bytes — keine valide Magic-Signatur
  return Buffer.alloc(sizeBytes, 0xAB).toString("base64");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("normalizeAnhaenge — Input-Validation", () => {
  it("liefert leeres Array bei nicht-Array-Input", () => {
    expect(normalizeAnhaenge(null)).toEqual([]);
    expect(normalizeAnhaenge(undefined)).toEqual([]);
    expect(normalizeAnhaenge("string")).toEqual([]);
    expect(normalizeAnhaenge({ key: "value" })).toEqual([]);
  });

  it("liefert leeres Array bei leerem Array", () => {
    expect(normalizeAnhaenge([])).toEqual([]);
  });
});

describe("normalizeAnhaenge — Field-Lookup case-insensitive", () => {
  it("akzeptiert verschiedene Field-Namen-Varianten", () => {
    const result = normalizeAnhaenge([
      { name: "test1.pdf", base64: makePdfBase64(), mime_type: "application/pdf" },
      { Name: "test2.pdf", contentBytes: makePdfBase64(), contentType: "application/pdf" },
      { fileName: "test3.pdf", "Content Bytes": makePdfBase64(), "Content Type": "application/pdf" },
    ]);
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe("test1.pdf");
    expect(result[1].name).toBe("test2.pdf");
    expect(result[2].name).toBe("test3.pdf");
  });

  it("nutzt Default-Name 'anhang' wenn keiner gefunden", () => {
    const result = normalizeAnhaenge([
      { base64: makePdfBase64(), mime_type: "application/pdf" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("anhang");
  });
});

describe("normalizeAnhaenge — Magic-Byte-Validation (F3.F1)", () => {
  it("octet-stream MIT PDF-Magic-Bytes → wird als PDF akzeptiert", () => {
    const result = normalizeAnhaenge([
      {
        name: "rechnung.pdf",
        base64: makePdfBase64(),
        mime_type: "application/octet-stream",
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].mime_type).toBe("application/pdf");
  });

  it("octet-stream MIT JPEG-Magic-Bytes → wird als JPEG akzeptiert", () => {
    const result = normalizeAnhaenge([
      {
        name: "foto.jpg",
        base64: makeJpegBase64(),
        mime_type: "application/octet-stream",
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].mime_type).toBe("image/jpeg");
  });

  it("octet-stream MIT PNG-Magic-Bytes → wird als PNG akzeptiert", () => {
    const result = normalizeAnhaenge([
      {
        name: "screenshot.png",
        base64: makePngBase64(),
        mime_type: "application/octet-stream",
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].mime_type).toBe("image/png");
  });

  it("octet-stream OHNE bekannte Magic-Bytes → ABGELEHNT (Sicherheit!)", () => {
    const result = normalizeAnhaenge([
      {
        name: "trojan.exe",
        base64: makeRandomBase64(),
        mime_type: "application/octet-stream",
      },
    ]);
    expect(result).toHaveLength(0);
  });

  it("Cross-Check: PDF deklariert aber random Bytes → ABGELEHNT", () => {
    const result = normalizeAnhaenge([
      {
        name: "fake.pdf",
        base64: makeRandomBase64(),
        mime_type: "application/pdf",
      },
    ]);
    expect(result).toHaveLength(0);
  });

  it("Cross-Check: JPEG deklariert aber PDF-Header → MIME wird korrigiert", () => {
    const result = normalizeAnhaenge([
      {
        name: "actually-pdf.jpg", // Falsche Endung
        base64: makePdfBase64(),
        mime_type: "image/jpeg",
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].mime_type).toBe("application/pdf"); // korrigiert
  });
});

describe("normalizeAnhaenge — Sicherheits-Filter", () => {
  it("SVG wird IMMER abgelehnt (XSS-Risiko)", () => {
    const svg = `<?xml version="1.0"?><svg><script>alert(1)</script></svg>`;
    const result = normalizeAnhaenge([
      {
        name: "logo.svg",
        base64: Buffer.from(svg).toString("base64"),
        mime_type: "image/svg+xml",
      },
    ]);
    expect(result).toHaveLength(0);
  });

  it("base64 zu kurz (<100 chars) wird übersprungen", () => {
    const result = normalizeAnhaenge([
      { name: "tiny.pdf", base64: "JVBERi0xLjQK", mime_type: "application/pdf" }, // ~12 chars
    ]);
    expect(result).toHaveLength(0);
  });

  it("Inline-Bild <5KB (Logo) wird gefiltert", () => {
    // Kleines Bild — JPEG-Magic + ~3KB Padding
    const small = Buffer.concat([
      Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]),
      Buffer.alloc(3000, 0x00),
    ]).toString("base64");
    const result = normalizeAnhaenge([
      { name: "signatur.jpg", base64: small, mime_type: "image/jpeg" },
    ]);
    expect(result).toHaveLength(0);
  });

  it("Bild ≥5KB wird durchgelassen", () => {
    const result = normalizeAnhaenge([
      { name: "scan.jpg", base64: makeJpegBase64(8000), mime_type: "image/jpeg" },
    ]);
    expect(result).toHaveLength(1);
  });

  it("Datei >4MB wird abgelehnt (Vercel-Lambda-Limit)", () => {
    // ~5MB PDF
    const huge = makePdfBase64(5_000_000);
    const result = normalizeAnhaenge([
      { name: "huge.pdf", base64: huge, mime_type: "application/pdf" },
    ]);
    expect(result).toHaveLength(0);
  });
});

describe("normalizeAnhaenge — MIME-Whitelist + Extension-Fallback", () => {
  it("akzeptiert PDF + JPEG + PNG", () => {
    const result = normalizeAnhaenge([
      { name: "doc.pdf", base64: makePdfBase64(), mime_type: "application/pdf" },
      { name: "img.jpg", base64: makeJpegBase64(), mime_type: "image/jpeg" },
      { name: "shot.png", base64: makePngBase64(), mime_type: "image/png" },
    ]);
    expect(result).toHaveLength(3);
  });

  it("nutzt Dateiendung als MIME-Fallback wenn MIME unbekannt", () => {
    const result = normalizeAnhaenge([
      {
        name: "rechnung.pdf",
        base64: makePdfBase64(),
        mime_type: "weird/unknown-type", // unbekannt → Endung greift
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].mime_type).toBe("application/pdf");
  });

  it("Anhang ohne MIME + ohne Endung → übersprungen", () => {
    const result = normalizeAnhaenge([
      { name: "noextension", base64: makePdfBase64(), mime_type: "weird/unknown" },
    ]);
    // PDF-Magic-Bytes greifen aber nicht (mime ist nicht octet-stream und nicht PDF/Image),
    // Cross-Check tritt nicht ein, MIME-Whitelist failed, Endung gibt nichts.
    expect(result).toHaveLength(0);
  });
});

describe("normalizeAnhaenge — End-to-End Realistic", () => {
  it("verarbeitet typischen Make.com-Payload (mehrere Anhänge gemischter Qualität)", () => {
    const result = normalizeAnhaenge([
      // 1. Echte Rechnung als PDF
      {
        name: "Rechnung_12345.pdf",
        base64: makePdfBase64(50_000),
        mime_type: "application/pdf",
      },
      // 2. M365-PDF mit octet-stream
      {
        Name: "Lieferschein.pdf",
        contentBytes: makePdfBase64(30_000),
        contentType: "application/octet-stream",
      },
      // 3. SVG-Logo (XSS-Risk → raus)
      {
        name: "footer.svg",
        base64: Buffer.from("<svg/>").toString("base64") + "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        mime_type: "image/svg+xml",
      },
      // 4. Tiny-Inline-Logo (<5KB → raus)
      {
        name: "footer.png",
        base64: Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47]), Buffer.alloc(2000)]).toString("base64"),
        mime_type: "image/png",
      },
      // 5. Trojaner als octet-stream ohne Magic (→ raus)
      {
        name: "evil.exe",
        base64: makeRandomBase64(50_000),
        mime_type: "application/octet-stream",
      },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Rechnung_12345.pdf");
    expect(result[1].name).toBe("Lieferschein.pdf");
    expect(result[1].mime_type).toBe("application/pdf"); // korrigiert von octet-stream
  });
});
