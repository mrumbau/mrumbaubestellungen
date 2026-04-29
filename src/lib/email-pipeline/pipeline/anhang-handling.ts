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
