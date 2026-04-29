/**
 * R5c — Anhang-Validierung und -Normalisierung
 *
 * Aus webhook/email/route.ts (Z. 266-359) extrahiert.
 *
 * - Case-insensitive Feldsuche (Make.com sendet name/Name/fileName etc.)
 * - Inline-Bilder <5KB filtern (Logos, keine echten Dokumente)
 * - SVG ausschließen (XSS-Risiko)
 * - MIME-Whitelist + Dateiendungs-Fallback
 * - 4MB-Größenlimit
 */

import { logInfo } from "@/lib/logger";
import { isFileSizeOk } from "@/lib/validation";
import { ALLOWED_MIME_TYPES, effectiveMimeType } from "./mail-utils";

/**
 * F3.F1 Fix: Magic-Byte-Validation für `application/octet-stream`-Anhänge.
 * Make.com/M365 senden PDFs gelegentlich mit generischem MIME — ohne Magic-Byte-
 * Check könnte ein Angreifer beliebige Binärdateien (.exe, .zip) durchschmuggeln.
 *
 * Erkennt PDF (%PDF-), JPEG (FF D8 FF), PNG (89 50 4E 47), GIF, BMP, TIFF, WebP.
 * Liefert null wenn unbekannt → Anhang wird verworfen.
 */
function detectMimeFromMagicBytes(base64: string): string | null {
  const head = base64.slice(0, 16);
  // PDF: "%PDF-" → base64 Prefix "JVBERi0"
  if (head.startsWith("JVBERi0")) return "application/pdf";
  // JPEG: FF D8 FF → base64 Prefix "/9j/"
  if (head.startsWith("/9j/")) return "image/jpeg";
  // PNG: 89 50 4E 47 → base64 Prefix "iVBORw0KGgo"
  if (head.startsWith("iVBORw0KGgo")) return "image/png";
  // GIF: "GIF87a" oder "GIF89a" → base64 Prefix "R0lGOD"
  if (head.startsWith("R0lGOD")) return "image/gif";
  // BMP: 42 4D → base64 Prefix "Qk"
  if (head.startsWith("Qk")) return "image/bmp";
  // WebP: starts with "RIFF" → "UklGR" + later "WEBP"
  if (head.startsWith("UklGR")) {
    // Check for WEBP-Marker zwischen Position 8-12 (RIFF+size+WEBP)
    const webpProbe = base64.slice(8, 24);
    try {
      const decoded = Buffer.from(webpProbe, "base64").toString("ascii");
      if (decoded.includes("WEBP")) return "image/webp";
    } catch { /* ignore */ }
  }
  // TIFF: 49 49 2A 00 (little-endian) → "SUkqAA" oder 4D 4D 00 2A → "TU0AKg"
  if (head.startsWith("SUkqAA") || head.startsWith("TU0AKg")) return "image/tiff";
  return null;
}

export interface NormalizedAnhang {
  name: string;
  base64: string;
  mime_type: string;
}

/**
 * Findet ein Feld im rohen Anhang-Objekt case-insensitive über mehrere
 * mögliche Schlüssel-Namen. Make.com kann z.B. `name`, `Name` oder
 * `Content Bytes` schicken — diese Funktion akzeptiert alle Varianten.
 */
function findField(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    if (raw[key] && typeof raw[key] === "string") return raw[key] as string;
  }
  // Fallback: case-insensitive Suche
  const rawKeys = Object.keys(raw);
  for (const key of keys) {
    const found = rawKeys.find(
      (k) => k.toLowerCase().replace(/[\s_-]/g, "") === key.toLowerCase().replace(/[\s_-]/g, ""),
    );
    if (found && raw[found] && typeof raw[found] === "string") return raw[found] as string;
  }
  return "";
}

/**
 * Normalisiert das rohe Anhang-Array von Make.com / Microsoft Graph zu
 * einer einheitlichen Liste mit name + base64 + mime_type.
 *
 * Skippt:
 * - leere/zu-kurze base64 (<100 chars)
 * - Inline-Bilder <5KB (Logos)
 * - SVG (XSS-Risiko)
 * - unbekannte MIME-Types ohne erkennbare Dateiendung
 * - Anhänge >4MB (Vercel-Lambda-Limit)
 */
export function normalizeAnhaenge(rawAnhaenge: unknown, email_betreff?: string, email_absender?: string): NormalizedAnhang[] {
  const anhaenge: NormalizedAnhang[] = [];

  logInfo("webhook/email", "Anhänge empfangen", {
    email_betreff,
    email_absender,
    raw_count: Array.isArray(rawAnhaenge) ? rawAnhaenge.length : 0,
    raw_type: typeof rawAnhaenge,
  });

  if (!Array.isArray(rawAnhaenge)) {
    if (rawAnhaenge && typeof rawAnhaenge === "object") {
      logInfo("webhook/email", "Anhänge kein Array!", {
        type: typeof rawAnhaenge,
        keys: Object.keys(rawAnhaenge as Record<string, unknown>).join(", "),
      });
    }
    return anhaenge;
  }

  for (let idx = 0; idx < rawAnhaenge.length; idx++) {
    const a = rawAnhaenge[idx];
    const raw = a as Record<string, unknown>;

    const name = findField(raw, "name", "Name", "fileName", "filename") || "anhang";
    const base64 = findField(raw, "base64", "contentBytes", "Content Bytes", "content_bytes", "data");
    let mimeType = (
      findField(raw, "mime_type", "mimeType", "contentType", "Content Type", "content_type", "type")
      || "application/octet-stream"
    ).toLowerCase();

    logInfo("webhook/email", `Anhang[${idx}] Details`, {
      name,
      mimeType,
      base64_length: base64 ? base64.length : 0,
      raw_keys: Object.keys(raw).join(", "),
    });

    if (!base64 || base64.length < 100) {
      logInfo("webhook/email", `Anhang[${idx}] übersprungen: base64 leer/zu kurz (${base64 ? base64.length : 0})`, { name });
      continue;
    }

    // F3.F1: Magic-Byte-Validation. Bei octet-stream (M365/Make-Quirk) den
    // tatsächlichen Typ aus den ersten Bytes ableiten — verhindert dass
    // .exe/.zip/.dll als PDF durchschmuggeln.
    if (mimeType === "application/octet-stream") {
      const magicMime = detectMimeFromMagicBytes(base64);
      if (!magicMime) {
        logInfo("webhook/email", `Anhang übersprungen (octet-stream ohne erkannte Magic-Bytes): ${name}`);
        continue;
      }
      mimeType = magicMime;
    }

    // Inline-Bilder/Logos filtern (Bilder <5KB sind keine echten Dokumente)
    const istBild = mimeType.startsWith("image/");
    const geschaetzteGroesse = Math.ceil((base64.length * 3) / 4);
    if (istBild && geschaetzteGroesse < 5_000) {
      logInfo("webhook/email", `Anhang[${idx}] übersprungen: Inline-Bild zu klein (${geschaetzteGroesse} Bytes)`, { name });
      continue;
    }

    mimeType = effectiveMimeType(mimeType, name);

    // SVG ausschließen (XSS-Risiko via JS in SVG)
    if (mimeType === "image/svg+xml") {
      logInfo("webhook/email", `Anhang übersprungen (SVG/XSS-Risiko): ${name}`);
      continue;
    }

    // F3.F1 Defense-in-Depth: Cross-Check Magic-Bytes auch wenn MIME nicht octet-stream
    // (Schutz gegen falsch deklariertes MIME). Nur wenn Magic-Byte-Detection
    // einen anderen Typ liefert UND die Detection eindeutig ist (nicht null).
    const claimedIsPdfOrImage = mimeType === "application/pdf" || mimeType.startsWith("image/");
    if (claimedIsPdfOrImage) {
      const detected = detectMimeFromMagicBytes(base64);
      if (detected && detected !== mimeType) {
        logInfo("webhook/email", `Anhang[${idx}] MIME korrigiert via Magic-Byte: ${mimeType} → ${detected}`, { name });
        mimeType = detected;
      } else if (!detected) {
        logInfo("webhook/email", `Anhang übersprungen (deklariert ${mimeType}, keine erkennbare Magic-Bytes): ${name}`);
        continue;
      }
    }

    // MIME-Whitelist oder Bilder durchlassen
    if (!ALLOWED_MIME_TYPES.has(mimeType) && !mimeType.startsWith("image/")) {
      const ext = name.split(".").pop()?.toLowerCase() || "";
      const EXT_MIME: Record<string, string> = {
        pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg",
        png: "image/png", webp: "image/webp", gif: "image/gif",
        tiff: "image/tiff", bmp: "image/bmp",
      };
      if (EXT_MIME[ext]) {
        mimeType = EXT_MIME[ext];
        logInfo("webhook/email", `Anhang[${idx}] MIME aus Dateiendung abgeleitet: ${ext} → ${mimeType}`, { name });
      } else {
        logInfo("webhook/email", `Anhang übersprungen (MIME: ${mimeType}): ${name}`);
        continue;
      }
    }

    if (!isFileSizeOk(base64)) {
      logInfo("webhook/email", `Anhang zu groß (>4MB): ${name}`);
      continue;
    }

    anhaenge.push({ name, base64, mime_type: mimeType });
  }

  return anhaenge;
}
