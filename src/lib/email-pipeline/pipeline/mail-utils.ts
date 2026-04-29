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
// HTML-Stripping
// =====================================================================
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
    .replace(/\s+/g, " ")
    .trim();
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
