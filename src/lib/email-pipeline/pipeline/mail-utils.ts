/**
 * R5c — Mail-Utils
 *
 * Pure Helper-Functions für die Email-Pipeline. Keine DB-Calls, keine
 * Side-Effects. Aus webhook/email/route.ts extrahiert (R5c).
 */

import { IRRELEVANT_DOMAINS as IRRELEVANT_DOMAINS_LIST, VERSAND_DOMAINS as VERSAND_DOMAINS_LIST } from "@/lib/blacklist-constants";

// =====================================================================
// MIME-TYPEN (Microsoft 365 / Make.com Kompatibilität)
// =====================================================================
export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/pdfa",
  "application/x-pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/tiff",
  "image/bmp",
  "application/octet-stream",
]);

export const PDF_MIME_ALIASES = new Set([
  "application/pdf",
  "application/pdfa",
  "application/x-pdf",
  "application/octet-stream",
]);

export function effectiveMimeType(mimeType: string, fileName: string): string {
  if (PDF_MIME_ALIASES.has(mimeType) && fileName.toLowerCase().endsWith(".pdf")) {
    return "application/pdf";
  }
  if (mimeType === "image/jpg") return "image/jpeg";
  return mimeType;
}

// =====================================================================
// SPAM-DOMAINS
// =====================================================================
const IRRELEVANT_DOMAINS = new Set(IRRELEVANT_DOMAINS_LIST);
const VERSAND_DOMAINS = new Set(VERSAND_DOMAINS_LIST);

export function extractEmailAddress(raw: string): string {
  if (!raw) return "";
  const match = raw.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return match ? match[0].toLowerCase() : raw.toLowerCase();
}

export function extractDomain(raw: string): string {
  const addr = extractEmailAddress(raw);
  return addr.split("@")[1] || "";
}

export function isIrrelevantDomain(domain: string): boolean {
  if (IRRELEVANT_DOMAINS.has(domain)) return true;
  for (const d of IRRELEVANT_DOMAINS) {
    if (domain.endsWith("." + d)) return true;
  }
  return false;
}

export function isVersandDomain(domain: string): boolean {
  if (VERSAND_DOMAINS.has(domain)) return true;
  for (const d of VERSAND_DOMAINS) {
    if (domain.endsWith("." + d)) return true;
  }
  return false;
}

// =====================================================================
// F3.F7: Defensive base64-Decoding
// =====================================================================

/**
 * Decodiert base64 zu Buffer mit defensiver Validation.
 * `Buffer.from(x, "base64")` wirft NICHT bei kaputten Inputs, sondern
 * liefert leeren oder verstümmelten Buffer. Diese Helper-Function fängt:
 *   - Leeren String
 *   - Decoded-Buffer kürzer als 50 Bytes (zu klein für PDF/Bild)
 *   - Decoded-Buffer ≥4× kürzer als Input (Indikator für Garbage)
 *
 * Liefert null wenn ungültig — Caller muss skippen oder Fehler signalisieren.
 */
export function safeBase64ToBuffer(base64: string): Buffer | null {
  if (!base64 || typeof base64 !== "string" || base64.length < 64) return null;
  try {
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length < 50) return null;
    // Sanity: base64 codiert ~4/3 der Bytes. Wenn Buffer <25% der Input-
    // Länge, war Input weitgehend Garbage.
    if (buffer.length < base64.length * 0.25) return null;
    return buffer;
  } catch {
    return null;
  }
}

// =====================================================================
// HTML-Stripping
// F3.F8 Fix: gefährliche URL-Protokolle (javascript:, data:, vbscript:) werden
// neutralisiert — verhindert dass nach Stripping noch ausführbare Inhalte als
// Plain-Text in KI-Prompts oder UI-Renderings landen.
// =====================================================================
const DANGEROUS_PROTOCOLS = /\b(javascript|vbscript|data|file|jar):/gi;

export function stripHtml(html: string): string {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#\d+;/g, "")
    .replace(DANGEROUS_PROTOCOLS, "[blocked-protocol]:")
    .replace(/\s+/g, " ")
    .trim();
}

// =====================================================================
// HTML → strukturerhaltendes Plain-Text (für KI-Body-Vorbereitung).
// 06.05.2026 — Make.com hat HTML einfach zu Single-Line-Whitespace gestripped,
// was bei Tabellen-Mails (Amazon-BB, Megabad, Telekom-Rechnungen) Beträge an
// die KI lieferte ohne Spalten-Kontext. Diese Variante bewahrt Block- und
// Tabellen-Struktur, sodass die KI Brutto/Netto/MwSt klar zuordnen kann.
//
// Strategie:
//   - <script>/<style> komplett entfernt
//   - <br>, <p>, <div>, <li>, <h1-h6> → Newline
//   - <tr> → Newline; <td>/<th> → ` | ` Trennung
//   - HTML-Entities decoded (&nbsp;, &amp;, &euro;, &#8364; etc.)
//   - Dangerous-Protocols neutralisiert (gleich wie stripHtml)
//   - Multi-Whitespace normalisiert (max 2 Newlines hintereinander)
// =====================================================================
const NUMERIC_ENTITY = /&#(\d+);/g;
const HEX_ENTITY = /&#x([0-9a-fA-F]+);/g;
const NAMED_ENTITY_MAP: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  euro: "€", pound: "£", yen: "¥", cent: "¢", copy: "©", reg: "®",
  trade: "™", hellip: "…", mdash: "—", ndash: "–", laquo: "«", raquo: "»",
  bdquo: "„", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  szlig: "ß", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü",
};

function decodeEntities(s: string): string {
  return s
    .replace(NUMERIC_ENTITY, (_, n) => {
      const code = parseInt(n, 10);
      return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(HEX_ENTITY, (_, h) => {
      const code = parseInt(h, 16);
      return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITY_MAP[name] ?? m);
}

export function htmlToStructuredText(html: string): string {
  if (!html || typeof html !== "string") return "";

  // Wenn kein HTML drin ist (Plain-Text-Mail), nur normalisieren.
  // Entities trotzdem decoden \u2014 manche Mail-Clients escapen `&amp;` oder
  // `&euro;` auch in Plain-Text.
  if (!/<[a-zA-Z\/!][^>]*>/.test(html)) {
    return decodeEntities(html)
      .replace(/\r\n?/g, "\n")
      .replace(/\u00A0/g, " ")
      .replace(/\u2028|\u2029/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(DANGEROUS_PROTOCOLS, "[blocked-protocol]:")
      .trim();
  }

  let s = html;

  // 1. Komplett entfernen: script, style, head, comments
  s = s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "");

  // 2. Block-Strukturen → Marker (vor Tag-Removal damit Newlines bleiben)
  s = s
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|section|article|header|footer|nav|aside|main|figure|blockquote|pre|h[1-6]|li|tr|table|thead|tbody|tfoot)\s*>/gi, "\n")
    .replace(/<\s*li\b[^>]*>/gi, "\n• ")
    .replace(/<\s*hr\s*\/?\s*>/gi, "\n———\n")
    // Tabellen-Cells: ` | ` zwischen td/th. Erste Cell pro Zeile bekommt nur Whitespace,
    // damit die Zeile nicht mit ` | ` startet.
    .replace(/<\s*\/\s*(td|th)\s*>\s*<\s*(td|th)\b[^>]*>/gi, " | ")
    .replace(/<\s*(td|th)\b[^>]*>/gi, "")
    .replace(/<\s*\/\s*(td|th)\s*>/gi, "");

  // 3. Übrige Tags entfernen (nach Block-Markern, sonst gehen die verloren)
  s = s.replace(/<[^>]+>/g, " ");

  // 4. HTML-Entities decoden
  s = decodeEntities(s);

  // 5. Dangerous-Protocols neutralisieren (gleich wie stripHtml)
  s = s.replace(DANGEROUS_PROTOCOLS, "[blocked-protocol]:");

  // 6. Whitespace normalisieren — pro Zeile, dann Multi-Newlines reduzieren
  s = s
    .replace(/\r\n?/g, "\n")
    .replace(/\u00A0/g, " ")        // non-breaking space
    .replace(/\u2028|\u2029/g, "\n") // line/paragraph separator
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "") // Control-Chars
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, i, arr) => {
      // Mehrere leere Zeilen hintereinander → eine
      if (line === "" && arr[i - 1] === "") return false;
      return true;
    })
    .join("\n")
    .trim();

  return s;
}

// =====================================================================
// Versand-Erkennung via Betreff
// =====================================================================
const VERSAND_BETREFF_KEYWORDS = [
  "versandbestätigung", "versandbestaetigung", "versandmitteilung",
  "sendungsverfolgung", "tracking-nummer", "trackingnummer", "tracking number",
  "wurde versendet", "wurde versandt", "ist versendet", "haben versendet",
  "shipped", "dispatched", "has been shipped",
  "zustellung heute", "wird zugestellt", "wurde zugestellt", "erfolgreich zugestellt",
  "paket wird zugestellt", "paket zugestellt", "paket wurde zugestellt",
  "zugestellt an", "delivered", "has been delivered",
  "ist unterwegs", "auf dem weg", "out for delivery", "in zustellung",
  "paket wurde", "sendung verfolgen", "ihr paket",
  "aktualisierung der voraussichtlichen lieferung",
  "lieferung erwartet", "voraussichtliche lieferung",
  "wird kommissioniert", "in kommissionierung", "kommissionierung übergeben",
];

const BESTELL_BETREFF_KEYWORDS = [
  "bestellbestätigung", "bestellbestaetigung", "auftragsbestätigung",
  "order confirmation", "ihre bestellung", "bestellung eingegangen",
  "bestellung bei", "rechnung", "invoice", "auftragsbestaetigung",
];

export function isVersandBetreff(betreff: string): boolean {
  const lower = (betreff || "").toLowerCase();
  return VERSAND_BETREFF_KEYWORDS.some((kw) => lower.includes(kw));
}

export function isBestellBetreff(betreff: string): boolean {
  const lower = (betreff || "").toLowerCase();
  return BESTELL_BETREFF_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Strikte Versand-Indikatoren — wenn ein Subject EINS davon enthält, ist es
 * EINDEUTIG eine Versand-/Liefermitteilung, auch wenn das Wort "Bestellung"
 * gleichzeitig vorkommt ("Ihre Bestellung ist unterwegs", "Ihre Bestellung
 * wird heute zugestellt", "Voraussichtlicher Liefertermin der Bestellung X").
 *
 * Diese Liste überstimmt den BB/VB-Tie-Break in der Pipeline-Weiche und die
 * KI-Klassifikation. Hintergrund: KI sieht "Bestellung" und klassifiziert
 * gerne als BB, obwohl der Inhalt klar Versand-Status ist (CHECK24, Megabad,
 * Hermes, DHL).
 */
const STRICT_VERSAND_OVERRIDE_KEYWORDS = [
  "ist unterwegs",
  "wird heute zugestellt",
  "wird zugestellt",
  "wurde zugestellt",
  "wurde geliefert",
  "ist da",
  "ist da!",
  "voraussichtlicher liefertermin",
  "lieferterminankündigung",
  "lieferterminankuendigung",
  "wurde versendet",
  "wurde versandt",
  "out for delivery",
  "has been delivered",
  "has been shipped",
  "sendung wird voraussichtlich",
  "sendung wurde geliefert",
  "sendung ist unterwegs",
  "haustürzustellung",
  "haustuerzustellung",
];

export function isStrictVersandBetreff(betreff: string): boolean {
  const lower = (betreff || "").toLowerCase();
  return STRICT_VERSAND_OVERRIDE_KEYWORDS.some((kw) => lower.includes(kw));
}
