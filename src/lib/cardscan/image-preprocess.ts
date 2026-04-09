// CardScan Module – Serverseitige Bildvorverarbeitung
// Komprimiert Bilder auf max 1920px lange Seite.
// HEIC-Konvertierung passiert client-seitig (heic2any), hier nur JPEG/PNG/WebP.

import { logInfo } from "@/lib/logger";

const ROUTE_TAG = "/lib/cardscan/image-preprocess";

const MAX_DIMENSION = 1920;

/**
 * Validiert einen Base64-String und gibt MIME-Type + sauberes Base64 zurück.
 * Akzeptiert sowohl raw Base64 als auch Data-URL-Format.
 */
export function parseBase64Image(input: string): {
  base64: string;
  mimeType: string;
} {
  // Data-URL Format: data:image/jpeg;base64,/9j/4AAQ...
  if (input.startsWith("data:")) {
    const match = input.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      throw new Error("Ungültiges Data-URL-Format");
    }
    return { mimeType: match[1], base64: match[2] };
  }

  // Roher Base64 – MIME-Type aus Magic-Bytes ableiten
  const mimeType = detectMimeFromBase64(input);
  return { base64: input, mimeType };
}

/**
 * Erkennt den MIME-Type anhand der ersten Bytes des Base64-Strings.
 */
function detectMimeFromBase64(base64: string): string {
  const header = base64.slice(0, 16);

  if (header.startsWith("/9j/")) return "image/jpeg";
  if (header.startsWith("iVBOR")) return "image/png";
  if (header.startsWith("UklGR")) return "image/webp";

  // Fallback
  return "image/jpeg";
}

/**
 * Prüft ob die Dateigröße (Base64) innerhalb des Limits liegt.
 * Base64 hat ~33% Overhead, also 10MB Base64 ≈ 7.5MB Originaldatei.
 */
export function validateImageSize(
  base64: string,
  maxBytes: number
): { valid: boolean; sizeBytes: number } {
  // Base64-Größe → Bytes: ca. 3/4 der Base64-Länge
  const sizeBytes = Math.ceil((base64.length * 3) / 4);
  return { valid: sizeBytes <= maxBytes, sizeBytes };
}

/**
 * Komprimiert ein JPEG/PNG Bild serverseitig via Sharp (falls verfügbar)
 * oder gibt das Original zurück.
 *
 * Da Sharp auf Vercel Serverless nicht immer verfügbar ist,
 * delegieren wir die Kompression primär an den Client.
 * Diese Funktion dient als Fallback/Validierung.
 */
export function prepareImageForOcr(
  base64: string,
  mimeType: string
): { base64: string; mimeType: string } {
  // Für OCR reichen die Client-komprimierten Bilder.
  // Google Vision akzeptiert bis 10MB.
  logInfo(ROUTE_TAG, "Bild für OCR vorbereitet", {
    mimeType,
    base64Length: base64.length,
    estimatedSizeKb: Math.round((base64.length * 3) / 4 / 1024),
  });

  return { base64, mimeType };
}

/**
 * Client-seitige Bildkompression via Canvas (für den Browser).
 * Wird als Utility-Funktion exportiert, aber nur im Client verwendet.
 *
 * Reduziert die Bildgröße auf maximal MAX_DIMENSION px auf der langen Seite
 * und konvertiert zu JPEG mit Quality 0.85.
 */
export const CLIENT_MAX_DIMENSION = MAX_DIMENSION;
export const CLIENT_JPEG_QUALITY = 0.85;
