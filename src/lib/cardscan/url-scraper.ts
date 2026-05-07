// CardScan Module – URL Scraper (Cheerio + Smart-Mode)
// Extrahiert Text von Firmenwebseiten. Versucht automatisch /impressum, /kontakt etc.
// SSRF-Schutz: Blockliste für interne IPs, nur http(s), Timeout 10s.

import * as cheerio from "cheerio";
import { logError, logInfo } from "@/lib/logger";

const ROUTE_TAG = "/lib/cardscan/url-scraper";

// ─── SSRF-Schutz ───────────────────────────────────────────────────

const BLOCKED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "metadata.google.internal",
  "169.254.169.254",
];

const SOCIAL_BLOCKED_DOMAINS = [
  "linkedin.com",
  "xing.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
];

const MAX_RESPONSE_BYTES = 500 * 1024; // 500 KB pro Response

const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  // IPv6 Unique-Local (fc00::/7) und Link-Local (fe80::/10)
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe[89ab][0-9a-f]:/i,
  // IPv6-mapped IPv4 dotted (::ffff:127.0.0.1)
  /^::ffff:10\./i,
  /^::ffff:172\.(1[6-9]|2\d|3[01])\./i,
  /^::ffff:192\.168\./i,
  /^::ffff:127\./i,
  /^::ffff:0\./i,
  // IPv6-mapped IPv4 hex form (Node WHATWG-URL normalisiert dorthin):
  // ::ffff:7fXX:YYYY → 127.0.0.0/8 (loopback)
  /^::ffff:7f[0-9a-f]{2}:/i,
  // ::ffff:aXX:YYYY → 10.0.0.0/8
  /^::ffff:a[0-9a-f]{2}:/i,
  // ::ffff:ac1X:YYYY → 172.16.0.0/12 (ac10-ac1f)
  /^::ffff:ac1[0-9a-f]:/i,
  // ::ffff:c0a8:YYYY → 192.168.0.0/16
  /^::ffff:c0a8:/i,
  // ::ffff:0:YYYY → 0.0.0.0/8
  /^::ffff:0:/i,
];

export function isBlockedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Nur http/https erlaubt
    if (!["http:", "https:"].includes(parsed.protocol)) return true;

    // Hostname-Blockliste
    // WHATWG URL liefert IPv6-Hostnames in Brackets ([fc00::1]) — für IP-Pattern-Match abziehen
    const rawHost = parsed.hostname.toLowerCase();
    const host = rawHost.startsWith("[") && rawHost.endsWith("]")
      ? rawHost.slice(1, -1)
      : rawHost;
    if (BLOCKED_HOSTS.includes(rawHost) || BLOCKED_HOSTS.includes(host)) return true;

    // Private IP-Ranges (inkl. IPv6-mapped + Bracket-stripped IPv6)
    if (PRIVATE_IP_RANGES.some((r) => r.test(host))) return true;

    // Port-Check (nur Standard-Ports erlaubt)
    if (parsed.port && !["80", "443", ""].includes(parsed.port)) return true;

    // Social-Media-Plattformen blockieren (Login-Wall, kein Scraping möglich)
    if (SOCIAL_BLOCKED_DOMAINS.some((d) => host.includes(d))) return true;

    return false;
  } catch {
    return true; // Ungültige URL → blockieren
  }
}

// ─── Kontakt-Subpages ──────────────────────────────────────────────

const CONTACT_PATHS = [
  "/impressum",
  "/kontakt",
  "/contact",
  "/imprint",
  "/about",
  "/ueber-uns",
  "/about-us",
];

// ─── HTML → Text Extraktion ─────────────────────────────────────────

/**
 * CF14: Heuristik für SPA-Erkennung (React/Vue/Angular/Svelte mit leerem Body).
 * Cheerio kann clientseitig gerendertes Markup nicht extrahieren — wir wollen
 * dem User stattdessen einen klaren Hinweis geben, statt generischem
 * "Zu wenig Text gefunden".
 */
function looksLikeSPA(html: string): boolean {
  const lower = html.toLowerCase();
  // Typische SPA-Mount-Points + leerer Body-Content
  const hasSpaRoot =
    /<div\s+id=["'](root|app|__next|app-mount|svelte)["']\s*>\s*<\/div>/i.test(html) ||
    /id=["']app["']\s*data-v-app/i.test(html);
  // Body-Inhalt sehr klein (nach Script/Style-Strip approximativ)
  const stripped = lower
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return hasSpaRoot && stripped.length < 300;
}

function extractTextFromHtml(html: string, url: string): string {
  const $ = cheerio.load(html);

  // Entferne irrelevante Elemente
  $("script, style, nav, footer, header, iframe, noscript, svg, form").remove();
  $("[role='navigation'], [role='banner'], [role='contentinfo']").remove();
  $(".cookie-banner, .cookie-consent, #cookie, .gdpr").remove();

  // Strukturierte Daten aus meta-Tags extrahieren
  const metaParts: string[] = [];
  const description = $('meta[name="description"]').attr("content");
  if (description) metaParts.push(description);

  // Hauptinhalt priorisieren
  const mainContent =
    $("main").text() ||
    $("[role='main']").text() ||
    $("article").text() ||
    $("#content").text() ||
    $(".content").text() ||
    $("body").text();

  // Seitentitel
  const title = $("title").text().trim();

  // Text bereinigen: Whitespace normalisieren
  const cleaned = mainContent
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();

  // Zusammensetzen
  const parts = [title, ...metaParts, cleaned].filter(Boolean);
  const combined = parts.join("\n\n");

  // Auf 8000 Zeichen begrenzen (GPT-4o Input)
  return combined.slice(0, 8000);
}

// ─── Fetch mit Timeout ──────────────────────────────────────────────

async function fetchPage(url: string, maxRedirects = 3): Promise<string | null> {
  try {
    let currentUrl = url;

    // Manuelle Redirect-Verfolgung mit SSRF-Check pro Hop
    for (let i = 0; i <= maxRedirects; i++) {
      if (isBlockedUrl(currentUrl)) return null;

      const res = await fetch(currentUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });

      // Redirect → nächsten Hop validieren
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location) return null;
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (!res.ok) return null;

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("xhtml")) {
        return null;
      }

      const reader = res.body?.getReader();
      if (!reader) return await res.text();

      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalBytes += value.length;
        if (totalBytes > MAX_RESPONSE_BYTES) break;
      }

      reader.cancel();
      const decoder = new TextDecoder("utf-8", { fatal: false });
      return decoder.decode(Buffer.concat(chunks));
    }

    // Zu viele Redirects
    return null;
  } catch {
    return null;
  }
}

// ─── Smart Scraping ─────────────────────────────────────────────────

interface ScrapeResult {
  text: string;
  scrapedUrls: string[];
  durationMs: number;
}

/**
 * Scrapet eine URL und versucht bei unvollständigen Daten automatisch
 * Unterseiten wie /impressum, /kontakt etc.
 */
export async function scrapeUrl(inputUrl: string): Promise<ScrapeResult> {
  const start = Date.now();

  // URL normalisieren
  let url = inputUrl.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  // Social-Media-Check (eigene Fehlermeldung)
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (SOCIAL_BLOCKED_DOMAINS.some((d) => host.includes(d))) {
      throw new Error(
        "Diese Plattform blockiert automatisches Scraping. Bitte öffne das Profil, markiere den Text und füge ihn unter 'Text einfügen' ein."
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("Plattform")) throw err;
  }

  // SSRF-Prüfung
  if (isBlockedUrl(url)) {
    throw new Error("Diese URL ist nicht erlaubt (interne/private Adresse).");
  }

  const scrapedUrls: string[] = [];
  const textParts: string[] = [];

  // 1. Hauptseite laden
  const mainHtml = await fetchPage(url);

  // CF14: SPA-Detection — bevor Cheerio ins Leere greift, klaren Hinweis geben
  if (mainHtml && looksLikeSPA(mainHtml)) {
    throw new Error(
      "Diese Webseite verwendet JavaScript-Rendering (SPA) und kann nicht automatisch ausgelesen werden. Bitte öffne die Kontakt- oder Impressum-Seite, kopiere den Text und füge ihn unter 'Text einfügen' ein."
    );
  }

  if (!mainHtml) {
    throw new Error("Webseite konnte nicht geladen werden. Prüfe die URL.");
  }

  scrapedUrls.push(url);
  const mainText = extractTextFromHtml(mainHtml, url);
  textParts.push(mainText);

  // 2. Prüfen ob Kontaktdaten-Signale vorhanden sind
  const hasContactSignals = /(@|tel:|phone|telefon|fax|e-mail|anschrift|adresse|impressum)/i.test(mainText);

  // 3. Falls wenig Kontaktdaten → Unterseiten versuchen
  if (!hasContactSignals || mainText.length < 500) {
    const baseUrl = new URL(url);
    const origin = baseUrl.origin;

    // Parallel max 2 Unterseiten abrufen (Hauptseite + 2 = max 3 Fetches)
    const subpagePromises = CONTACT_PATHS.slice(0, 2).map(async (path) => {
      const subUrl = `${origin}${path}`;
      if (isBlockedUrl(subUrl)) return null;

      const html = await fetchPage(subUrl);
      if (!html) return null;

      scrapedUrls.push(subUrl);
      return extractTextFromHtml(html, subUrl);
    });

    const subResults = await Promise.allSettled(subpagePromises);
    for (const result of subResults) {
      if (result.status === "fulfilled" && result.value) {
        textParts.push(result.value);
      }
    }
  }

  const combinedText = textParts.join("\n\n---\n\n").slice(0, 10_000);
  const durationMs = Date.now() - start;

  logInfo(ROUTE_TAG, "Scraping abgeschlossen", {
    inputUrl,
    pagesScraped: scrapedUrls.length,
    textLength: combinedText.length,
    durationMs,
  });

  if (combinedText.trim().length < 20) {
    throw new Error("Zu wenig Text auf der Webseite gefunden. Bitte Daten manuell unter 'Text einfügen' eingeben.");
  }

  return { text: combinedText, scrapedUrls, durationMs };
}
