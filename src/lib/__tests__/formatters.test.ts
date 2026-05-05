/**
 * Formatter-Tests — i18n-Korrektheit (de-DE Tausenderpunkt + Komma).
 */

import { describe, it, expect } from "vitest";
import { formatBetrag, formatDatum } from "../formatters";

describe("formatBetrag — de-DE Currency", () => {
  it("formatiert ganze Euro-Beträge mit Komma + €-Suffix", () => {
    const result = formatBetrag(1234.56);
    // de-DE: "1.234,56 €" (mit Schmalspatium U+202F vor €)
    expect(result).toMatch(/1\.234,56\s*€/);
  });

  it("zeigt '–' für null", () => {
    expect(formatBetrag(null)).toBe("–");
  });

  it("akzeptiert alternative Währung", () => {
    const result = formatBetrag(99.99, "USD");
    expect(result).toMatch(/99,99/);
    expect(result).toMatch(/\$|US\$|USD/);
  });

  it("0 wird als '0,00 €' formatiert (NICHT als '–')", () => {
    const result = formatBetrag(0);
    expect(result).toMatch(/0,00\s*€/);
  });

  it("formatiert große Beträge mit Tausenderpunkt", () => {
    const result = formatBetrag(1234567.89);
    expect(result).toMatch(/1\.234\.567,89/);
  });

  it("rundet sehr kleine Beträge auf 2 Nachkommastellen", () => {
    const result = formatBetrag(0.001);
    expect(result).toMatch(/0,00\s*€/);
  });
});

describe("formatDatum — de-DE Date", () => {
  it("formatiert ISO-Datum als DD.MM.YYYY", () => {
    expect(formatDatum("2026-04-20")).toBe("20.04.2026");
  });

  it("zeigt '–' für null", () => {
    expect(formatDatum(null)).toBe("–");
  });

  it("formatiert ISO mit Zeitstempel korrekt (akzeptiert TZ-Drift bei ±1 Tag)", () => {
    const result = formatDatum("2026-05-04T08:30:00.000Z");
    // 2026-05-04 in UTC kann je nach Server-TZ als 04.05. oder 05.05. erscheinen
    expect(result).toMatch(/^0[45]\.05\.2026$/);
  });

  it("zeigt 1-stellige Tag/Monat als 2-stellig (führende Null)", () => {
    expect(formatDatum("2026-01-05")).toBe("05.01.2026");
  });
});
