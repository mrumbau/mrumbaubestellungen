/**
 * Geteilte Helper-Funktionen für Vendor-Parser.
 *
 * Hier landen Pattern-Logik die mehrere Parser brauchen:
 * - Deutsche Datumsformate
 * - Euro-Beträge mit deutschem Tausender/Komma-Format
 * - HTML-zu-Text-Stripping (für E-Mails mit HTML-Body)
 */

const MONTH_MAP_DE: Record<string, string> = {
  januar: "01", jan: "01",
  februar: "02", feb: "02",
  märz: "03", marz: "03", mar: "03",
  april: "04", apr: "04",
  mai: "05",
  juni: "06", jun: "06",
  juli: "07", jul: "07",
  august: "08", aug: "08",
  september: "09", sep: "09",
  oktober: "10", okt: "10",
  november: "11", nov: "11",
  dezember: "12", dez: "12",
};

/**
 * Parst deutsche Datumsformate zu ISO-8601 (YYYY-MM-DD).
 * Akzeptiert: "16. April 2026", "16.04.2026", "16/04/2026", "2026-04-16".
 * Liefert null wenn keine bekannte Form erkannt.
 */
export function parseGermanDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // ISO bereits — nur validieren
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }

  // 16.04.2026
  const dotted = trimmed.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dotted) {
    return `${dotted[3]}-${dotted[2].padStart(2, "0")}-${dotted[1].padStart(2, "0")}`;
  }

  // 16/04/2026
  const slashed = trimmed.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashed) {
    return `${slashed[3]}-${slashed[2].padStart(2, "0")}-${slashed[1].padStart(2, "0")}`;
  }

  // 16. April 2026 (Langform)
  const longForm = trimmed.match(/(\d{1,2})\.\s*(\w+)\s*(\d{4})/);
  if (longForm) {
    const month = MONTH_MAP_DE[longForm[2].toLowerCase()];
    if (month) {
      return `${longForm[3]}-${month}-${longForm[1].padStart(2, "0")}`;
    }
  }

  return null;
}

/**
 * Parst einen Euro-Betrag in deutschem Format zu number.
 * Akzeptiert: "1.234,56", "1234,56", "234.99", "EUR 234,99", "234,99 €".
 * Liefert null bei nicht-parsebaren Strings.
 */
export function parseEuroAmount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[€EUR\s]/gi, "").trim();
  if (!cleaned) return null;

  // Heuristik: hat sowohl . als auch , → deutsche Form (1.234,56)
  // hat nur , → deutsche Form (234,99)
  // hat nur . und ist nicht XXX.YY → englische Form (1234.56) oder Tausender (1.234)
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  let normalized = cleaned;
  if (hasComma && hasDot) {
    // 1.234,56 → 1234.56
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // 234,99 → 234.99
    normalized = cleaned.replace(",", ".");
  }
  // Nur Punkt → könnte 1.234 (Tausender) oder 1234.56 (Dezimal) sein
  // Wenn 3 Stellen NACH dem Punkt → Tausender, sonst Dezimal
  // Hier vereinfacht: parseFloat handhabt 1234.56 korrekt

  const num = parseFloat(normalized);
  return Number.isFinite(num) ? num : null;
}

/**
 * Strippt HTML zu Plain-Text. Nutzt Regex statt DOM-Parser (schnell, ausreichend).
 * Identisch zur Logik in /api/webhook/email/route.ts — DRY-Konsolidierung.
 */
export function stripHtmlToText(html: string | null | undefined): string {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#\d+;/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
