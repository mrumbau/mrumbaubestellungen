import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { analysiereDokument, erkenneHaendlerAusEmail, type DokumentAnalyse } from "@/lib/openai";
import { isFileSizeOk } from "@/lib/validation";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { updateBestellungStatus } from "@/lib/bestellung-utils";
import { logError, logInfo } from "@/lib/logger";
import { buildTrackingUrl } from "@/lib/tracking-urls";
import { IRRELEVANT_DOMAINS as IRRELEVANT_DOMAINS_LIST, VERSAND_DOMAINS as VERSAND_DOMAINS_LIST } from "@/lib/blacklist-constants";
import { safeCompare } from "@/lib/safe-compare";

// Vercel Serverless: max 60 Sekunden Laufzeit
export const maxDuration = 60;

// =====================================================================
// ERLAUBTE MIME-TYPEN (erweitert für Microsoft 365 / Make.com)
// =====================================================================
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/pdfa",           // PDF/A Archivformat (M365/b4value.net)
  "application/x-pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/tiff",
  "image/bmp",
  "application/octet-stream",   // M365 sendet PDFs manchmal so
]);

// MIME-Typen die als PDF behandelt werden sollen
const PDF_MIME_ALIASES = new Set([
  "application/pdf",
  "application/pdfa",           // PDF/A Archivformat
  "application/x-pdf",
  "application/octet-stream",   // wenn Dateiname .pdf hat
]);

function effectiveMimeType(mimeType: string, fileName: string): string {
  if (PDF_MIME_ALIASES.has(mimeType) && fileName.toLowerCase().endsWith(".pdf")) {
    return "application/pdf";
  }
  // image/jpg → image/jpeg normalisieren
  if (mimeType === "image/jpg") return "image/jpeg";
  return mimeType;
}

// =====================================================================
// SPAM-SCHUTZ: Offensichtlich irrelevante Absender-Domains
// =====================================================================
const IRRELEVANT_DOMAINS = new Set(IRRELEVANT_DOMAINS_LIST);

// Versand-Domains: Tracking-Emails, keine eigenen Bestellungen
const VERSAND_DOMAINS = new Set(VERSAND_DOMAINS_LIST);

function extractEmailAddress(raw: string): string {
  if (!raw) return "";
  const match = raw.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return match ? match[0].toLowerCase() : raw.toLowerCase();
}

function extractDomain(raw: string): string {
  const addr = extractEmailAddress(raw);
  return addr.split("@")[1] || "";
}

function isIrrelevantDomain(domain: string): boolean {
  if (IRRELEVANT_DOMAINS.has(domain)) return true;
  // Subdomain-Check: z.B. "mail.gmx.de" → "gmx.de"
  for (const d of IRRELEVANT_DOMAINS) {
    if (domain.endsWith("." + d)) return true;
  }
  return false;
}

function isVersandDomain(domain: string): boolean {
  if (VERSAND_DOMAINS.has(domain)) return true;
  for (const d of VERSAND_DOMAINS) {
    if (domain.endsWith("." + d)) return true;
  }
  return false;
}

// =====================================================================
// HTML-Stripping
// =====================================================================
function stripHtml(html: string): string {
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
// HAUPTLOGIK
// =====================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Rate-Limiting
    const rlKey = getRateLimitKey(request, "webhook-email");
    const rl = checkRateLimit(rlKey, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Zu viele Anfragen." },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      );
    }

    const body = await request.json();
    const { email_betreff, email_absender, email_datum, secret } = body;

    // 1. Secret prüfen
    if (!safeCompare(secret, process.env.MAKE_WEBHOOK_SECRET)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Vorfilter von Make.com (email-check Endpoint hat bereits geprüft)
    const vorfilter = body.vorfilter || "";
    const vorfilterHaendlerId = body.haendler_id || null;
    const vorfilterHaendlerName = body.haendler_name || null;
    const vorfilterSuId = body.su_id || null;
    const vorfilterBestellnummer = body.bestellnummer_betreff || null;
    const hatVorfilter = vorfilter === "ja";

    if (vorfilter === "nein") {
      logInfo("webhook/email", "Vorfilter: irrelevant", { email_betreff, email_absender });
      return NextResponse.json({ success: true, skipped: true, reason: "vorfilter_nein" });
    }

    const absenderAdresse = extractEmailAddress(email_absender);
    const absenderDomain = extractDomain(email_absender);

    const supabase = createServiceClient();

    // 3. Irrelevante Domains + Blacklist — NUR wenn kein Vorfilter (sonst bereits geprüft)
    if (!hatVorfilter) {
      if (isIrrelevantDomain(absenderDomain)) {
        const { data: bekannterHaendler } = await supabase
          .from("haendler")
          .select("id")
          .contains("email_absender", [absenderAdresse])
          .limit(1);
        const { data: bekannterSU } = await supabase
          .from("subunternehmer")
          .select("id")
          .contains("email_absender", [absenderAdresse])
          .limit(1);

        if ((!bekannterHaendler || bekannterHaendler.length === 0) &&
            (!bekannterSU || bekannterSU.length === 0)) {
          logInfo("webhook/email", `Irrelevante Domain: ${absenderDomain}`, { email_betreff });
          return NextResponse.json({ success: true, skipped: true, reason: "irrelevant_domain" });
        }
      }

      const { data: blacklist } = await supabase.from("email_blacklist").select("muster, typ");
      if (blacklist && blacklist.length > 0) {
        const istBlockiert = blacklist.some((bl) => {
          const muster = bl.muster.toLowerCase();
          if (bl.typ === "adresse") return absenderAdresse === muster;
          return absenderDomain === muster || absenderDomain.endsWith("." + muster);
        });
        if (istBlockiert) {
          return NextResponse.json({ success: true, skipped: true, reason: "blacklisted" });
        }
      }
    }

    // 5. Idempotenz-Check (24h-Fenster, SHA-256 für kollisionsarmen Hash)
    // Fail-open: Bei DB-Fehler Email trotzdem verarbeiten (lieber Duplikat als Datenverlust)
    const idempotencyKey = `${email_absender || ""}|${email_betreff || ""}|${email_datum || ""}`;
    const { createHash } = await import("crypto");
    const idempotencyHash = createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 64);
    try {
      const { data: existing, error: idempotencyError } = await supabase
        .from("webhook_logs")
        .select("id")
        .eq("typ", "email")
        .eq("bestellnummer", idempotencyHash)
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1);

      if (idempotencyError) {
        logError("webhook/email", "Idempotenz-Check DB-Fehler (fail-open)", idempotencyError);
      } else if (existing && existing.length > 0) {
        return NextResponse.json({ success: true, deduplicated: true });
      }

      await supabase.from("webhook_logs").insert({
        typ: "email",
        status: "processing",
        bestellnummer: idempotencyHash,
      });
    } catch (idempotencyErr) {
      logError("webhook/email", "Idempotenz-Check Fehler (fail-open)", idempotencyErr);
    }

    // 6. Betreff-Validierung
    if (email_betreff && email_betreff.length > 500) {
      return NextResponse.json({ error: "Betreff zu lang" }, { status: 400 });
    }

    // =====================================================================
    // AUTO-BEREINIGUNG: Versand-only Einträge + abgelaufene Signale
    // Läuft gelegentlich (~10% der Requests) um DB sauber zu halten
    // =====================================================================
    // Gelegentliche Bereinigung (~10% der Requests)
    if (Math.random() < 0.1) {
      // 1. Versand-only Einträge nach 48h löschen
      const achtundvierzigStundenZurueck = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data: versandOnly } = await supabase
        .from("bestellungen")
        .select("id")
        .eq("hat_versandbestaetigung", true)
        .eq("hat_bestellbestaetigung", false)
        .eq("hat_rechnung", false)
        .eq("hat_lieferschein", false)
        .in("status", ["offen"])
        .lt("created_at", achtundvierzigStundenZurueck)
        .limit(20);

      if (versandOnly && versandOnly.length > 0) {
        const vIds = versandOnly.map(b => b.id);
        await supabase.from("webhook_logs").delete().in("bestellung_id", vIds);
        await supabase.from("kommentare").delete().in("bestellung_id", vIds);
        await supabase.from("dokumente").delete().in("bestellung_id", vIds);
        await supabase.from("bestellungen").delete().in("id", vIds);
        logInfo("webhook/email", `Auto-Bereinigung: ${vIds.length} versand-only Einträge gelöscht`);
      }

      // 2. Abgelaufene Signale als expired markieren (48h ohne Match)
      await supabase.from("bestellung_signale")
        .update({ status: "expired" })
        .eq("status", "pending")
        .lt("zeitstempel", achtundvierzigStundenZurueck);
    }

    // =====================================================================
    // ANHÄNGE NORMALISIEREN + FILTERN (nicht rejecten!)
    // =====================================================================
    const rawAnhaenge = body.anhaenge || [];
    const anhaenge: { name: string; base64: string; mime_type: string }[] = [];

    // Debug-Log: Was kommt von Make.com an?
    logInfo("webhook/email", "Anhänge empfangen", {
      email_betreff,
      email_absender,
      raw_count: Array.isArray(rawAnhaenge) ? rawAnhaenge.length : 0,
      raw_type: typeof rawAnhaenge,
      hasAttachments_field: body.hasAttachments,
    });

    if (Array.isArray(rawAnhaenge)) {
      for (let idx = 0; idx < rawAnhaenge.length; idx++) {
        const a = rawAnhaenge[idx];
        const raw = a as Record<string, unknown>;

        // Case-insensitive Feld-Suche: Make.com kann Feldnamen in beliebiger Schreibweise senden
        // (name/Name, contentBytes/Content Bytes, contentType/Content Type, etc.)
        const findField = (...keys: string[]): string => {
          for (const key of keys) {
            if (raw[key] && typeof raw[key] === "string") return raw[key] as string;
          }
          // Fallback: case-insensitive Suche über alle Schlüssel
          const rawKeys = Object.keys(raw);
          for (const key of keys) {
            const found = rawKeys.find(k => k.toLowerCase().replace(/[\s_-]/g, "") === key.toLowerCase().replace(/[\s_-]/g, ""));
            if (found && raw[found] && typeof raw[found] === "string") return raw[found] as string;
          }
          return "";
        };

        const name = findField("name", "Name", "fileName", "filename") || "anhang";
        const base64 = findField("base64", "contentBytes", "Content Bytes", "content_bytes", "data");
        let mimeType = (findField("mime_type", "mimeType", "contentType", "Content Type", "content_type", "type") || "application/octet-stream").toLowerCase();

        // Debug-Log: Details pro Anhang
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

        // Inline-Bilder/Logos filtern: Bilder < 5 KB sind keine echten Dokumente
        const istBild = mimeType.startsWith("image/");
        const geschaetzteGroesse = Math.ceil((base64.length * 3) / 4);
        if (istBild && geschaetzteGroesse < 5_000) {
          logInfo("webhook/email", `Anhang[${idx}] übersprungen: Inline-Bild zu klein (${geschaetzteGroesse} Bytes)`, { name });
          continue;
        }

        // MIME-Typ normalisieren (PDF-Aliase, jpg→jpeg)
        mimeType = effectiveMimeType(mimeType, name);

        // SVG-Dateien ausschließen (können JavaScript/XSS enthalten)
        if (mimeType === "image/svg+xml") {
          logInfo("webhook/email", `Anhang übersprungen (SVG/XSS-Risiko): ${name}`);
          continue;
        }

        // MIME-Check: bekannte Typen oder Bilder durchlassen
        if (!ALLOWED_MIME_TYPES.has(mimeType) && !mimeType.startsWith("image/")) {
          // Letzter Fallback: Dateiendung prüfen
          const ext = name.split(".").pop()?.toLowerCase() || "";
          const EXT_MIME: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", tiff: "image/tiff", bmp: "image/bmp" };
          if (EXT_MIME[ext]) {
            mimeType = EXT_MIME[ext];
            logInfo("webhook/email", `Anhang[${idx}] MIME aus Dateiendung abgeleitet: ${ext} → ${mimeType}`, { name });
          } else {
            logInfo("webhook/email", `Anhang übersprungen (MIME: ${mimeType}): ${name}`);
            continue;
          }
        }

        // Größe prüfen – zu große skippen
        if (!isFileSizeOk(base64)) {
          logInfo("webhook/email", `Anhang zu groß (>4MB): ${name}`);
          continue;
        }

        anhaenge.push({ name, base64, mime_type: mimeType });
      }
    } else if (rawAnhaenge && typeof rawAnhaenge === "object") {
      logInfo("webhook/email", "Anhänge kein Array!", { type: typeof rawAnhaenge, keys: Object.keys(rawAnhaenge).join(", ") });
    }

    // =====================================================================
    // E-MAIL BODY EXTRAHIEREN
    // =====================================================================
    const rawEmailText = body.email_text || body.email_body || "";
    const emailText = stripHtml(rawEmailText);

    // =====================================================================
    // VERSAND-EMAILS SPEZIELL BEHANDELN
    // =====================================================================
    const istVersandDomain = isVersandDomain(absenderDomain);

    // Betreff-basierte Versand-Erkennung (für Händler wie Amazon die alles von derselben Domain senden)
    // NUR eindeutige Versand-Keywords, keine generischen wie "zustellung" oder "ihre lieferung"
    const versandBetreffKeywords = [
      // Versandbestätigung
      "versandbestätigung", "versandbestaetigung", "versandmitteilung",
      // Tracking
      "sendungsverfolgung", "tracking-nummer", "trackingnummer", "tracking number",
      // Versand-Status
      "wurde versendet", "wurde versandt", "ist versendet", "haben versendet",
      "shipped", "dispatched", "has been shipped",
      // Zustellung
      "zustellung heute", "wird zugestellt", "wurde zugestellt", "erfolgreich zugestellt",
      "paket wird zugestellt", "paket zugestellt", "paket wurde zugestellt",
      "zugestellt an", "delivered", "has been delivered",
      // Unterwegs
      "ist unterwegs", "auf dem weg", "out for delivery", "in zustellung",
      // Paket
      "paket wurde", "sendung verfolgen", "ihr paket",
      // Lieferung
      "aktualisierung der voraussichtlichen lieferung",
      "lieferung erwartet", "voraussichtliche lieferung",
      // Kommissionierung
      "wird kommissioniert", "in kommissionierung", "kommissionierung übergeben",
    ];
    // Bestellbestätigung-Keywords als Gegenprüfung — wenn der Betreff auch auf eine Bestellung hindeutet, NICHT als Versand behandeln
    const bestellBetreffKeywords = [
      "bestellbestätigung", "bestellbestaetigung", "auftragsbestätigung",
      "order confirmation", "ihre bestellung", "bestellung eingegangen",
      "bestellung bei", "rechnung", "invoice", "auftragsbestaetigung",
    ];
    const betreffLowerVersand = (email_betreff || "").toLowerCase();
    const istVersandBetreff = versandBetreffKeywords.some(kw => betreffLowerVersand.includes(kw));
    const istBestellBetreff = bestellBetreffKeywords.some(kw => betreffLowerVersand.includes(kw));

    if (istVersandDomain || (istVersandBetreff && !istBestellBetreff)) {
      // Versand-Emails: An existierende Bestellung anhängen, KEINE neue erstellen
      logInfo("webhook/email", `Versand-Email erkannt via ${istVersandDomain ? "Domain" : "Betreff"}`, { email_betreff, absenderDomain });
      return await handleVersandEmail(supabase, {
        email_betreff,
        email_absender,
        email_datum,
        emailText,
        anhaenge,
        absenderDomain,
        startTime,
      });
    }

    // =====================================================================
    // HÄNDLER ERKENNEN — Vorfilter-Daten nutzen wenn vorhanden
    // =====================================================================
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let haendler: any = null;
    let erkannterSubunternehmer: { id: string; firma: string } | null = null;
    let bestellungsart: "material" | "subunternehmer" | "abo" = "material";

    if (vorfilterHaendlerId) {
      // Vorfilter hat Händler bereits identifiziert → direkt aus DB laden (1 Query statt vollem Scan)
      const { data: vfHaendler } = await supabase
        .from("haendler")
        .select("*")
        .eq("id", vorfilterHaendlerId)
        .maybeSingle();
      if (vfHaendler) {
        haendler = vfHaendler;
        // Auto-learn: Absender-Adresse ergänzen
        const bestehendeAdressen: string[] = haendler.email_absender || [];
        if (absenderAdresse && !bestehendeAdressen.some((a: string) => a.toLowerCase() === absenderAdresse) && bestehendeAdressen.length < 10) {
          await supabase
            .from("haendler")
            .update({ email_absender: [...bestehendeAdressen, absenderAdresse] })
            .eq("id", haendler.id);
        }
      }
    } else if (vorfilterSuId) {
      // Vorfilter hat Subunternehmer identifiziert → direkt laden
      const { data: vfSU } = await supabase
        .from("subunternehmer")
        .select("id, firma")
        .eq("id", vorfilterSuId)
        .maybeSingle();
      if (vfSU) {
        erkannterSubunternehmer = { id: vfSU.id, firma: vfSU.firma };
        bestellungsart = "subunternehmer";
      }
    }

    // Fallback: Kein Vorfilter-Match → volle DB-Suche (für direkte API-Aufrufe ohne Make.com)
    if (!haendler && !erkannterSubunternehmer) {
      const { data: haendlerListe } = await supabase.from("haendler").select("*");

      haendler = haendlerListe?.find((h) =>
        h.email_absender?.some((addr: string) => {
          const normalized = addr.toLowerCase().trim();
          if (normalized.startsWith("*@")) {
            return absenderAdresse.endsWith("@" + normalized.slice(2));
          }
          return absenderAdresse === normalized;
        })
      ) || null;

      if (!haendler && absenderDomain) {
        haendler = haendlerListe?.find((h) => {
          const hDomain = h.domain?.toLowerCase();
          if (!hDomain) return false;
          return absenderDomain === hDomain || absenderDomain.endsWith("." + hDomain);
        }) || null;

        if (haendler && absenderAdresse) {
          const bestehendeAdressen: string[] = haendler.email_absender || [];
          if (!bestehendeAdressen.some((a: string) => a.toLowerCase() === absenderAdresse) && bestehendeAdressen.length < 10) {
            await supabase
              .from("haendler")
              .update({ email_absender: [...bestehendeAdressen, absenderAdresse] })
              .eq("id", haendler.id);
          }
        }
      }

      // SU-Check nur wenn kein Händler gefunden
      if (!haendler) {
        const { data: suListe } = await supabase.from("subunternehmer").select("*");
        if (suListe && suListe.length > 0) {
          const suMatch = suListe.find((su) =>
            su.email_absender?.some((addr: string) => {
              const normalized = addr.toLowerCase().trim();
              if (normalized.startsWith("*@")) {
                return absenderAdresse.endsWith("@" + normalized.slice(2));
              }
              return absenderAdresse === normalized;
            })
          );
          if (suMatch) {
            erkannterSubunternehmer = { id: suMatch.id, firma: suMatch.firma };
            bestellungsart = "subunternehmer";
          } else {
            const suDomainMatch = suListe.find((su) => {
              const suDomain = su.email?.split("@")[1]?.toLowerCase();
              if (suDomain === absenderDomain) return true;
              return su.email_absender?.some((addr: string) => addr.split("@")[1]?.toLowerCase() === absenderDomain);
            });
            if (suDomainMatch) {
              erkannterSubunternehmer = { id: suDomainMatch.id, firma: suDomainMatch.firma };
              bestellungsart = "subunternehmer";
            }
          }
        }
      }
    }

    // ── Plancraft-Spezialbehandlung: SU schickt Rechnungen über Plancraft ──
    if (!haendler && !erkannterSubunternehmer &&
        (absenderDomain === "plancraft.com" || absenderDomain === "mail.plancraft.com")) {
      bestellungsart = "subunternehmer";
      // Versuche SU-Name aus Betreff/Body zu extrahieren (z.B. "Georg Hutter - Prometheus Haustechnik GbR")
      // GPT-Analyse der Anhänge wird den SU-Namen aus der Rechnung extrahieren
    }

    // ── Abo-Anbieter-Erkennung: Emails von bekannten Abo-Anbietern automatisch als "abo" markieren ──
    // Prüft IMMER (auch wenn Händler gefunden) — Abo hat Priorität über Material-Händler
    if (bestellungsart === "material") {
      const { data: aboListe } = await supabase.from("abo_anbieter").select("*");
      if (aboListe && aboListe.length > 0) {
        const aboMatch = aboListe.find((ab) => {
          // Exakter Email-Absender Match
          if (ab.email_absender?.some((addr: string) => addr.toLowerCase().trim() === absenderAdresse)) return true;
          // Domain-Match
          if (ab.domain && (absenderDomain === ab.domain.toLowerCase() || absenderDomain.endsWith("." + ab.domain.toLowerCase()))) return true;
          return false;
        });
        if (aboMatch) {
          bestellungsart = "abo";
          if (!haendler) haendler = { id: null, name: aboMatch.name, domain: aboMatch.domain };
          logInfo("webhook/email", `Abo-Anbieter erkannt: ${aboMatch.name}`, { absenderDomain, absenderAdresse });
        }
      }
    }

    // ── PayPal-Spezialbehandlung: Zahlungsbestätigungen zu Bestellungen ──
    // PayPal-Emails werden normal verarbeitet, GPT erkennt den Händler aus dem Zahlungstext

    const haendlerDomain = haendler?.domain || absenderDomain;
    // Plancraft ist kein Händler/SU — es ist nur ein Tool. Nie als Name verwenden.
    const istPlancraftDomain = absenderDomain === "plancraft.com" || absenderDomain === "mail.plancraft.com";
    // Plancraft ist ein Tool, kein Händler — Name wird später aus GPT-Analyse übernommen
    let haendlerName = haendler?.name || vorfilterHaendlerName || absenderDomain;
    // Amazon: immer "Amazon Business" als Händlername (statt chinesische Marketplace-Seller-Namen)
    const istAmazon = absenderDomain === "amazon.de" || absenderDomain === "amazon.com" || absenderDomain.endsWith(".amazon.de") || absenderDomain.endsWith(".amazon.com");
    if (istAmazon) haendlerName = "Amazon Business";
    const haendlerNameIstNurDomain = haendlerName === absenderDomain;

    // =====================================================================
    // ANHÄNGE PARALLEL ANALYSIEREN (GPT-4o) — max 3 gleichzeitig
    // =====================================================================
    const analyseErgebnisse: { analyse: DokumentAnalyse; dateiName: string; base64: string; mime_type: string }[] = [];

    if (anhaenge.length > 0) {
      // Maximal 3 Anhänge parallel analysieren
      const batch = anhaenge.slice(0, 3);
      const analysePromises = batch.map(async (anhang) => {
        try {
          const analyse = await analysiereDokument(anhang.base64, anhang.mime_type);
          return { analyse, dateiName: anhang.name, base64: anhang.base64, mime_type: anhang.mime_type };
        } catch (err) {
          logError("webhook/email", `Analyse fehlgeschlagen: ${anhang.name}`, err);
          return null;
        }
      });

      const results = await Promise.all(analysePromises);
      for (const r of results) {
        if (r) analyseErgebnisse.push(r);
      }

      logInfo("webhook/email", `${analyseErgebnisse.length}/${batch.length} Anhänge analysiert`, {
        dauer_ms: Date.now() - startTime,
      });
    }

    // =====================================================================
    // BESTELLER ZUORDNEN (leichtgewichtig, kein extra GPT-Call)
    // =====================================================================
    let bestellerKuerzel = "";
    let zuordnungsMethode = "";

    const parsedDate = email_datum ? new Date(email_datum) : new Date();
    const emailZeit = isNaN(parsedDate.getTime()) ? Date.now() : parsedDate.getTime();

    // STUFE 0: Bestellnummer-Match (höchste Zuverlässigkeit, 100% Match)
    // Extension hat die Bestellnummer von der Bestätigungsseite extrahiert.
    // Bestellnummer aus Betreff/Body extrahieren für schnellen Match (GPT-Analyse kommt erst später)
    const betreffNrMatch = (email_betreff || "").match(/(?:bestellnummer|bestellung|order|auftrag|auftrags-?nr)[:\s#]*([A-Z0-9][\w\-]{2,29})/i)
      || (email_betreff || "").match(/(\d{3}-\d{7}-\d{7})/); // Amazon-Format
    // Bestellnummer: Vorfilter (email-check) hat Priorität, dann eigene Extraktion
    const schnellBestellnummer = vorfilterBestellnummer || betreffNrMatch?.[1] || null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let signal: any = null;
    if (schnellBestellnummer) {
      const { data: signalByNr } = await supabase
        .from("bestellung_signale")
        .select("*")
        .eq("order_nummer", schnellBestellnummer)
        .eq("status", "pending")
        .order("zeitstempel", { ascending: false })
        .limit(1);

      if (signalByNr?.[0]) {
        const { data: claimed } = await supabase
          .from("bestellung_signale")
          .update({ status: "matched", verarbeitet: true })
          .eq("id", signalByNr[0].id)
          .eq("status", "pending")
          .select("id");
        if (claimed && claimed.length > 0) {
          signal = signalByNr[0];
          bestellerKuerzel = signal.kuerzel;
          zuordnungsMethode = "bestellnummer_match";
          logInfo("webhook/email", `Besteller per Bestellnummer zugeordnet: ${signal.kuerzel}`, { bestellnummer: schnellBestellnummer });
        }
      }
    }

    // STUFE 1: Chrome Extension Signal ±4h (Fallback wenn kein Bestellnummer-Match)
    if (!bestellerKuerzel) {
      const { data: signale } = await supabase
        .from("bestellung_signale")
        .select("*")
        .eq("haendler_domain", haendlerDomain)
        .eq("status", "pending")
        .gte("zeitstempel", new Date(emailZeit - 4 * 60 * 60 * 1000).toISOString())
        .lte("zeitstempel", new Date(emailZeit + 4 * 60 * 60 * 1000).toISOString())
        .order("confidence", { ascending: false })
        .order("zeitstempel", { ascending: false })
        .limit(1);

      if (signale?.[0]) {
        const { data: claimed } = await supabase
          .from("bestellung_signale")
          .update({ status: "matched", verarbeitet: true })
          .eq("id", signale[0].id)
          .eq("status", "pending")
          .select("id");
        if (claimed && claimed.length > 0) {
          signal = signale[0];
          bestellerKuerzel = signal.kuerzel;
          zuordnungsMethode = "signal_4h";
        }
      }
    }

    // STUFE 3: Händler-Affinität (DB-basiert, kein GPT)
    if (!bestellerKuerzel) {
      const { data: affinitaet } = await supabase
        .from("bestellungen")
        .select("besteller_kuerzel")
        .eq("haendler_name", haendlerName)
        .neq("besteller_kuerzel", "UNBEKANNT")
        .order("created_at", { ascending: false })
        .limit(50);

      if (affinitaet && affinitaet.length >= 3) {
        const zaehler = new Map<string, number>();
        for (const b of affinitaet) {
          zaehler.set(b.besteller_kuerzel, (zaehler.get(b.besteller_kuerzel) || 0) + 1);
        }
        const sortiert = [...zaehler.entries()].sort((a, b) => b[1] - a[1]);
        const [topKuerzel, topAnzahl] = sortiert[0];
        if (topAnzahl / affinitaet.length > 0.6) {
          bestellerKuerzel = topKuerzel;
          zuordnungsMethode = "haendler_affinitaet";
        }
      }
    }

    // STUFE 4: Name im Text suchen (kein GPT)
    if (!bestellerKuerzel) {
      const { data: benutzerListe } = await supabase
        .from("benutzer_rollen")
        .select("kuerzel, name, email")
        .in("rolle", ["besteller", "admin"]);

      if (benutzerListe) {
        // Zuerst: GPT-extrahierter Besteller-Name (präziser als Volltext-Suche)
        const gptBesteller = analyseErgebnisse.find((e) => e.analyse.besteller_im_dokument)?.analyse.besteller_im_dokument?.toLowerCase() || "";
        if (gptBesteller) {
          for (const benutzer of benutzerListe) {
            const namen = benutzer.name.toLowerCase().split(" ");
            if (namen.length >= 2 && namen.every((n: string) => gptBesteller.includes(n))) {
              bestellerKuerzel = benutzer.kuerzel;
              zuordnungsMethode = "besteller_im_dokument";
              break;
            }
          }
        }

        // Fallback: Volltext-Suche
        if (!bestellerKuerzel) {
          const suchTexte = [
            emailText,
            email_betreff || "",
            ...analyseErgebnisse.map((e) => e.analyse.volltext || ""),
            ...analyseErgebnisse.map((e) => JSON.stringify(e.analyse.lieferadressen || [])),
          ].join(" ").toLowerCase();

          for (const benutzer of benutzerListe) {
            const namen = benutzer.name.toLowerCase().split(" ");
            if (namen.length >= 2 && namen.every((n: string) => suchTexte.includes(n))) {
              bestellerKuerzel = benutzer.kuerzel;
              zuordnungsMethode = "name_im_text";
              break;
            }
          }
        }
      }
    }

    // STUFE 5: Fallback → UNBEKANNT
    if (!bestellerKuerzel) {
      bestellerKuerzel = "UNBEKANNT";
      zuordnungsMethode = "unbekannt";
    }

    // Besteller-Name holen
    let { data: benutzer } = await supabase
      .from("benutzer_rollen")
      .select("name")
      .eq("kuerzel", bestellerKuerzel)
      .maybeSingle();

    // =====================================================================
    // BESTELLUNG FINDEN ODER ERSTELLEN
    // =====================================================================
    let bestellungId: string;
    let bestellungNeuErstellt = false;

    const erkannteBestellnummer = analyseErgebnisse.find((e) => e.analyse.bestellnummer)?.analyse.bestellnummer || null;
    const erkannteAuftragsnummer = analyseErgebnisse.find((e) => e.analyse.auftragsnummer)?.analyse.auftragsnummer || null;
    const erkannteLieferscheinnummer = analyseErgebnisse.find((e) => e.analyse.lieferscheinnummer)?.analyse.lieferscheinnummer || null;

    // STUFE 0 Nachlauf: GPT-Bestellnummer für Matching nutzen
    if (erkannteBestellnummer) {
      if (!signal && bestellerKuerzel === "UNBEKANNT") {
        // Kein Signal bisher → versuche per GPT-Bestellnummer zu matchen
        const { data: signalByGpt } = await supabase
          .from("bestellung_signale")
          .select("*")
          .eq("order_nummer", erkannteBestellnummer)
          .eq("status", "pending")
          .limit(1);

        if (signalByGpt?.[0]) {
          const { data: claimed } = await supabase
            .from("bestellung_signale")
            .update({ status: "matched", verarbeitet: true })
            .eq("id", signalByGpt[0].id)
            .eq("status", "pending")
            .select("id");
          if (claimed && claimed.length > 0) {
            signal = signalByGpt[0];
            bestellerKuerzel = signal.kuerzel;
            zuordnungsMethode = "bestellnummer_match_gpt";
            logInfo("webhook/email", `Besteller per GPT-Bestellnummer zugeordnet: ${signal.kuerzel}`, { bestellnummer: erkannteBestellnummer });
            const { data: nachlaufBenutzer } = await supabase
              .from("benutzer_rollen").select("name").eq("kuerzel", bestellerKuerzel).maybeSingle();
            if (nachlaufBenutzer) benutzer = nachlaufBenutzer;
          }
        }
      }

      // Signal hatte keine order_nummer → jetzt mit GPT-Bestellnummer upgraden
      if (signal && !signal.order_nummer) {
        await supabase.from("bestellung_signale")
          .update({ order_nummer: erkannteBestellnummer })
          .eq("id", signal.id);
      }
    }

    // 1. Suche per Bestellnummer / Auftragsnummer (mit Händler-Filter)
    // Alle drei Nummern werden für Matching genutzt: bestellnummer, auftragsnummer, lieferscheinnummer
    let existierendeBestellung: { id: string; hat_bestellbestaetigung?: boolean; hat_lieferschein?: boolean; hat_rechnung?: boolean; hat_aufmass?: boolean; hat_leistungsnachweis?: boolean; hat_versandbestaetigung?: boolean } | null = null;
    const stufe1Select = "id, hat_bestellbestaetigung, hat_lieferschein, hat_rechnung, hat_aufmass, hat_leistungsnachweis, hat_versandbestaetigung";

    // Alle erkannten Nummern für Suche sammeln
    const suchNummern = [erkannteBestellnummer, erkannteAuftragsnummer, erkannteLieferscheinnummer].filter(Boolean) as string[];

    for (const suchNr of suchNummern) {
      if (existierendeBestellung) break;
      // Per bestellnummer ODER auftragsnummer suchen
      if (haendler?.id) {
        // Suche in bestellnummer
        const { data: d1 } = await supabase.from("bestellungen").select(stufe1Select)
          .eq("bestellnummer", suchNr).eq("haendler_id", haendler.id).limit(1).maybeSingle();
        if (d1) { existierendeBestellung = d1; break; }
        // Suche in auftragsnummer
        const { data: d2 } = await supabase.from("bestellungen").select(stufe1Select)
          .eq("auftragsnummer", suchNr).eq("haendler_id", haendler.id).limit(1).maybeSingle();
        if (d2) { existierendeBestellung = d2; break; }
        // Suche in lieferscheinnummer
        const { data: d2b } = await supabase.from("bestellungen").select(stufe1Select)
          .eq("lieferscheinnummer", suchNr).eq("haendler_id", haendler.id).limit(1).maybeSingle();
        if (d2b) { existierendeBestellung = d2b; break; }
      }
      if (!existierendeBestellung && haendlerName) {
        const { data: d3 } = await supabase.from("bestellungen").select(stufe1Select)
          .eq("bestellnummer", suchNr).eq("haendler_name", haendlerName).limit(1).maybeSingle();
        if (d3) { existierendeBestellung = d3; break; }
        const { data: d4 } = await supabase.from("bestellungen").select(stufe1Select)
          .eq("auftragsnummer", suchNr).eq("haendler_name", haendlerName).limit(1).maybeSingle();
        if (d4) { existierendeBestellung = d4; break; }
        const { data: d4b } = await supabase.from("bestellungen").select(stufe1Select)
          .eq("lieferscheinnummer", suchNr).eq("haendler_name", haendlerName).limit(1).maybeSingle();
        if (d4b) { existierendeBestellung = d4b; break; }
      }
      if (!existierendeBestellung && erkannterSubunternehmer) {
        const { data: d5 } = await supabase.from("bestellungen").select(stufe1Select)
          .eq("bestellnummer", suchNr).eq("subunternehmer_id", erkannterSubunternehmer.id).limit(1).maybeSingle();
        if (d5) { existierendeBestellung = d5; break; }
      }
    }

      // Prüfe ob die bestehende Bestellung den Dokumenttyp schon hat
      // Pro Bestellung kann es nur eine Rechnung, eine Bestellbestätigung etc. geben
      // Wenn der Typ schon existiert → nicht zuordnen, neue Bestellung erstellen
      if (existierendeBestellung) {
        const hauptTyp = analyseErgebnisse
          .filter(e => ["bestellbestaetigung", "lieferschein", "rechnung", "aufmass", "leistungsnachweis", "versandbestaetigung"].includes(e.analyse.typ))
          .map(e => e.analyse.typ)[0];
        const typFlagCheck: Record<string, string> = {
          bestellbestaetigung: "hat_bestellbestaetigung",
          lieferschein: "hat_lieferschein",
          rechnung: "hat_rechnung",
          aufmass: "hat_aufmass",
          leistungsnachweis: "hat_leistungsnachweis",
          versandbestaetigung: "hat_versandbestaetigung",
        };
        const flagKey = hauptTyp ? typFlagCheck[hauptTyp] : null;
        if (flagKey && existierendeBestellung[flagKey as keyof typeof existierendeBestellung]) {
          // Gleicher Dokumenttyp existiert schon bei gleicher Bestellnummer → Duplikat verwerfen
          // (z.B. gleiche Rechnung von zwei Make.com Szenarien die verschiedene Outlook-Ordner überwachen)
          logInfo("webhook/email", `Duplikat verworfen: Bestellung hat bereits ${hauptTyp}`, {
            bestellungId: existierendeBestellung.id, bestellnummer: erkannteBestellnummer, typ: hauptTyp,
          });
          return NextResponse.json({
            success: true,
            skipped: true,
            reason: "duplikat_typ_existiert",
            bestellungId: existierendeBestellung.id,
            typ: hauptTyp,
          });
        }
      }

    // 1a. Erweiterte Cross-Suche: Jede erkannte Nummer in ALLEN drei Spalten suchen (ohne Händler-Filter)
    // Fängt Fälle wo der Händlername leicht abweicht oder die haendler_id nicht gesetzt ist
    if (!existierendeBestellung && suchNummern.length > 0) {
      for (const suchNr of suchNummern) {
        if (existierendeBestellung) break;
        const { data: crossMatch } = await supabase
          .from("bestellungen")
          .select(stufe1Select)
          .or(`bestellnummer.eq.${suchNr},auftragsnummer.eq.${suchNr},lieferscheinnummer.eq.${suchNr}`)
          .limit(1)
          .maybeSingle();
        if (crossMatch) {
          existierendeBestellung = crossMatch;
          logInfo("webhook/email", `Cross-Match gefunden (ohne Händler-Filter)`, { suchNr, bestellungId: crossMatch.id });
        }
      }
    }

    if (existierendeBestellung) {
      bestellungId = existierendeBestellung.id;
    } else {
      // 1b. Betrag+Händler Match (gleiche Bestellung mit anderer Nummer)
      // Shops wie Bernstein senden Bestellbestätigung mit Nr. #83347, dann Auftragsbestätigung mit Nr. 2610752.
      // Gleicher Händler + gleicher Betrag + <24h alt + gleicher Dokumenttyp schon vorhanden → Nummern ergänzen statt Duplikat erstellen.
      const erkannterBetrag24h = analyseErgebnisse.find(e => e.analyse.gesamtbetrag)?.analyse.gesamtbetrag || null;
      const hauptTyp24h = analyseErgebnisse
        .filter(e => ["bestellbestaetigung", "lieferschein", "rechnung", "aufmass", "leistungsnachweis"].includes(e.analyse.typ))
        .map(e => e.analyse.typ)[0];

      if (erkannterBetrag24h && hauptTyp24h && haendlerName) {
        const betragMatchZeitraum = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(); // 14 Tage Fenster (Lieferscheine/Rechnungen können bis zu 10+ Tage später kommen)
        const typFlag24h: Record<string, string> = {
          bestellbestaetigung: "hat_bestellbestaetigung",
          lieferschein: "hat_lieferschein",
          rechnung: "hat_rechnung",
          aufmass: "hat_aufmass",
          leistungsnachweis: "hat_leistungsnachweis",
        };
        const flag24h = typFlag24h[hauptTyp24h];

        if (flag24h) {
          const { data: betragMatch } = await supabase
            .from("bestellungen")
            .select("id, bestellnummer, auftragsnummer, betrag")
            .ilike("haendler_name", `%${haendlerName}%`)
            .eq("betrag", erkannterBetrag24h)
            .gte("created_at", betragMatchZeitraum)
            .in("status", ["offen", "vollstaendig"])
            .limit(1)
            .maybeSingle();

          if (betragMatch) {
            // Gleiche Bestellung mit anderer Nummer → Nummern ergänzen, Duplikat verhindern
            const nummernUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
            if (erkannteBestellnummer && !betragMatch.bestellnummer) nummernUpdate.bestellnummer = erkannteBestellnummer;
            if (erkannteAuftragsnummer && !betragMatch.auftragsnummer) nummernUpdate.auftragsnummer = erkannteAuftragsnummer;
            if (Object.keys(nummernUpdate).length > 1) {
              await supabase.from("bestellungen").update(nummernUpdate).eq("id", betragMatch.id);
            }

            logInfo("webhook/email", `Betrag-Match: gleicher Händler + Betrag innerhalb 24h → Duplikat verworfen`, {
              bestellungId: betragMatch.id, betrag: erkannterBetrag24h, haendler: haendlerName,
              alteNr: betragMatch.bestellnummer, neueNr: erkannteBestellnummer,
            });

            return NextResponse.json({
              success: true,
              skipped: true,
              reason: "betrag_match_24h",
              bestellungId: betragMatch.id,
            });
          }
        }
      }

      // 2. Erweiterte Suche: Gleicher Händler/SU + offene Bestellung die den Dokumenttyp noch nicht hat
        // Verhindert Duplikate wenn verschiedene Dokumente derselben Bestellung zeitversetzt ankommen
        // (z.B. Rechnung zuerst, dann Bestellbestätigung/Aufmaß nachträglich)
        let erweiterterMatch: string | null = null;
        const analyseTypen = analyseErgebnisse
          .filter(e => ["bestellbestaetigung", "lieferschein", "rechnung", "aufmass", "leistungsnachweis", "versandbestaetigung"].includes(e.analyse.typ))
          .map(e => e.analyse.typ);

        if (analyseTypen.length > 0) {
          const vierzehnTageZurueck = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
          const typFlagMap: Record<string, string> = {
            bestellbestaetigung: "hat_bestellbestaetigung",
            lieferschein: "hat_lieferschein",
            rechnung: "hat_rechnung",
            aufmass: "hat_aufmass",
            leistungsnachweis: "hat_leistungsnachweis",
            versandbestaetigung: "hat_versandbestaetigung",
          };

          let erweiterteQuery = supabase
            .from("bestellungen")
            .select("id, bestellnummer, auftragsnummer, betrag, haendler_name, hat_bestellbestaetigung, hat_lieferschein, hat_rechnung, hat_aufmass, hat_leistungsnachweis, hat_versandbestaetigung")
            .in("status", ["offen", "erwartet", "vollstaendig", "abweichung"])
            .gte("created_at", vierzehnTageZurueck);

          if (haendler?.id) {
            erweiterteQuery = erweiterteQuery.eq("haendler_id", haendler.id);
          } else if (erkannterSubunternehmer?.id) {
            erweiterteQuery = erweiterteQuery.eq("subunternehmer_id", erkannterSubunternehmer.id);
          } else if (haendlerName) {
            // Kein Händler in DB, aber Name erkannt → über haendler_name suchen
            erweiterteQuery = erweiterteQuery.ilike("haendler_name", `%${haendlerName}%`);
          } else {
            // Weder Händler-ID noch Name → erweiterte Suche nicht sinnvoll
            erweiterteQuery = null as unknown as typeof erweiterteQuery;
          }

          // Besteller einschränken wenn bekannt (UNBEKANNT matcht zu breit)
          if (erweiterteQuery && bestellerKuerzel && bestellerKuerzel !== "UNBEKANNT") {
            erweiterteQuery = erweiterteQuery.eq("besteller_kuerzel", bestellerKuerzel);
          }

          const kandidaten = erweiterteQuery
            ? (await erweiterteQuery.order("created_at", { ascending: false }).limit(5)).data
            : null;

          if (kandidaten && kandidaten.length > 0) {
            const hauptTyp = analyseTypen[0];
            const flag = typFlagMap[hauptTyp];

            if (flag) {
              const erkannterBetrag = analyseErgebnisse.find(e => e.analyse.gesamtbetrag)?.analyse.gesamtbetrag;

              const match = kandidaten.find(k => {
                // Muss den Dokumenttyp noch nicht haben
                if (k[flag as keyof typeof k]) return false;
                // Nummern-Validierung: wenn Nummern auf beiden Seiten bekannt sind, müssen sie übereinstimmen
                // Verhindert falsches Matching bei mehreren Bestellungen beim selben Händler
                // Prüfe alle drei Nummern kreuzweise
                const kandidatNummern = [k.bestellnummer, (k as Record<string, unknown>).auftragsnummer as string | null].filter(Boolean);
                const dokumentNummern = [erkannteBestellnummer, erkannteAuftragsnummer].filter(Boolean);
                if (kandidatNummern.length > 0 && dokumentNummern.length > 0) {
                  const hatUebereinstimmung = dokumentNummern.some(dn => kandidatNummern.includes(dn));
                  if (!hatUebereinstimmung) return false;
                }
                // Betrag-Validierung: wenn beide Beträge bekannt, max 15% Abweichung erlauben
                if (erkannterBetrag && k.betrag) {
                  const abweichung = Math.abs(Number(k.betrag) - erkannterBetrag) / Math.max(Number(k.betrag), erkannterBetrag);
                  if (abweichung > 0.15) return false;
                }
                return true;
              });

              if (match) {
                erweiterterMatch = match.id;
                logInfo("webhook/email", "Erweiterte Zuordnung: Dokument an bestehende Bestellung", {
                  bestellungId: match.id, typ: hauptTyp, email_absender, email_betreff,
                });
              }
            }
          }
        }

        if (erweiterterMatch) {
          bestellungId = erweiterterMatch;
        } else {
          // 4. Neue Bestellung anlegen
          // Bestellungsart aus GPT-Analyse übernehmen
          if (bestellungsart === "material" && analyseErgebnisse.length > 0) {
            const vermuteteArt = analyseErgebnisse.find((e) => e.analyse.vermutete_bestellungsart)?.analyse.vermutete_bestellungsart;
            if (vermuteteArt === "subunternehmer") bestellungsart = "subunternehmer";
          }

          // Händlername aus GPT-Analyse übernehmen wenn nur Absender-Domain bekannt
          // (z.B. plancraft.com ist nur ein Tool — der echte Firmenname steht im Dokument)
          if (haendlerName === absenderDomain && analyseErgebnisse.length > 0) {
            const gptHaendler = analyseErgebnisse.find((e) => e.analyse.haendler)?.analyse.haendler;
            if (gptHaendler) {
              logInfo("webhook/email", `Händlername aus GPT übernommen (statt Domain ${absenderDomain})`, { gptHaendler });
              haendlerName = gptHaendler;
            }
          }

          const { data: neue, error: insertError } = await supabase
            .from("bestellungen")
            .insert({
              bestellnummer: erkannteBestellnummer,
              haendler_id: haendler?.id || null,
              haendler_name: erkannterSubunternehmer?.firma || haendlerName,
              besteller_kuerzel: bestellerKuerzel,
              besteller_name: benutzer?.name || bestellerKuerzel,
              status: "offen",
              zuordnung_methode: zuordnungsMethode,
              bestellungsart,
              subunternehmer_id: erkannterSubunternehmer?.id || null,
            })
            .select()
            .single();

          if (insertError && erkannteBestellnummer) {
            const { data: fallback } = await supabase
              .from("bestellungen")
              .select("id")
              .eq("bestellnummer", erkannteBestellnummer)
              .limit(1)
              .maybeSingle();
            if (fallback) {
              bestellungId = fallback.id;
            } else {
              throw new Error("Bestellung konnte weder angelegt noch gefunden werden");
            }
          } else if (!neue) {
            throw new Error("Bestellung konnte nicht angelegt werden");
          } else {
            bestellungId = neue.id;
            bestellungNeuErstellt = true;
          }
        }
      }

    if (!bestellungId) {
      throw new Error("Keine bestellungId gesetzt — weder gefunden noch erstellt");
    }

    // =====================================================================
    // DOKUMENTE SPEICHERN
    // =====================================================================
    let dokumenteGespeichert = 0;
    const bekannteTypen = ["bestellbestaetigung", "lieferschein", "rechnung", "aufmass", "leistungsnachweis", "versandbestaetigung"];
    const gespeicherteTypen: string[] = [];

    for (const ergebnis of analyseErgebnisse) {
      const { analyse, dateiName, base64, mime_type } = ergebnis;

      // Unbekannte Dokumenttypen oder GPT-Parse-Fehler überspringen
      if (!bekannteTypen.includes(analyse.typ) || analyse.parse_fehler) {
        logInfo("webhook/email", `Anhang übersprungen: typ="${analyse.typ}", parse_fehler=${!!analyse.parse_fehler}, datei="${dateiName}"`);
        continue;
      }

      // Storage Upload
      const storagePfad = `${bestellungId}/${analyse.typ}_${Date.now()}_${dateiName}`;
      const buffer = Buffer.from(base64, "base64");
      const { error: uploadError } = await supabase.storage
        .from("dokumente")
        .upload(storagePfad, buffer, { contentType: mime_type, upsert: true });

      if (uploadError) {
        logError("webhook/email", `Storage Upload fehlgeschlagen: ${storagePfad}`, uploadError);
        // Ohne Datei kein Dokument speichern — Ghost-Einträge vermeiden
        continue;
      }

      const { error: insertError } = await supabase.from("dokumente").insert({
        bestellung_id: bestellungId,
        typ: analyse.typ,
        quelle: "email",
        storage_pfad: storagePfad,
        email_betreff,
        email_absender,
        email_datum,
        ki_roh_daten: analyse,
        bestellnummer_erkannt: analyse.bestellnummer,
        auftragsnummer: analyse.auftragsnummer || null,
        lieferscheinnummer: analyse.lieferscheinnummer || null,
        artikel: analyse.artikel,
        gesamtbetrag: analyse.gesamtbetrag,
        netto: analyse.netto,
        mwst: analyse.mwst,
        faelligkeitsdatum: analyse.faelligkeitsdatum,
        lieferdatum: analyse.lieferdatum,
        iban: analyse.iban,
        kundennummer: analyse.kundennummer || null,
        besteller_im_dokument: analyse.besteller_im_dokument || null,
        projekt_referenz: analyse.projekt_referenz || null,
        bestelldatum: analyse.bestelldatum || null,
      });

      if (insertError) {
        logError("webhook/email", `Dokument-Insert fehlgeschlagen`, insertError);
        continue;
      }

      // Bestellung updaten
      const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() };

      // Dokument-Flags setzen
      const flagMap: Record<string, string> = {
        bestellbestaetigung: "hat_bestellbestaetigung",
        lieferschein: "hat_lieferschein",
        rechnung: "hat_rechnung",
        aufmass: "hat_aufmass",
        leistungsnachweis: "hat_leistungsnachweis",
        versandbestaetigung: "hat_versandbestaetigung",
      };

      if (flagMap[analyse.typ]) {
        updateFields[flagMap[analyse.typ]] = true;
      }

      // Versandbestätigung: Tracking-Daten setzen, aber Bestellnummer/Betrag NICHT überschreiben
      if (analyse.typ === "versandbestaetigung") {
        if (analyse.tracking_nummer) updateFields.tracking_nummer = analyse.tracking_nummer;
        if (analyse.versanddienstleister) updateFields.versanddienstleister = analyse.versanddienstleister;
        if (analyse.tracking_url) {
          updateFields.tracking_url = analyse.tracking_url;
        } else if (analyse.versanddienstleister && analyse.tracking_nummer) {
          const autoUrl = buildTrackingUrl(analyse.versanddienstleister, analyse.tracking_nummer);
          if (autoUrl) updateFields.tracking_url = autoUrl;
        }
        if (analyse.voraussichtliche_lieferung) updateFields.voraussichtliche_lieferung = analyse.voraussichtliche_lieferung;
      } else {
        // Nummern aus Nicht-Versand-Dokumenten übernehmen
        if (analyse.bestellnummer) updateFields.bestellnummer = analyse.bestellnummer;
        if (analyse.auftragsnummer) updateFields.auftragsnummer = analyse.auftragsnummer;
        if (analyse.lieferscheinnummer) updateFields.lieferscheinnummer = analyse.lieferscheinnummer;
        // Betrag nur von Rechnungen übernehmen (Rechnungsbetrag ist maßgeblich, nicht Bestellbestätigung)
        // Fallback: netto verwenden wenn gesamtbetrag null (z.B. steuerfreie innergemeinschaftliche Lieferung, 0% MwSt)
        const effektiverBetrag = analyse.gesamtbetrag != null ? analyse.gesamtbetrag : (analyse.netto ?? null);
        const istNetto = !analyse.gesamtbetrag && !!analyse.netto;
        if (effektiverBetrag && analyse.typ === "rechnung") {
          updateFields.betrag = effektiverBetrag;
          if (istNetto) updateFields.betrag_ist_netto = true;
        } else if (effektiverBetrag) {
          // Bestellbestätigung/Lieferschein: nur setzen wenn noch kein Betrag in DB
          const { data: existing } = await supabase
            .from("bestellungen")
            .select("betrag")
            .eq("id", bestellungId)
            .maybeSingle();
          if (existing && !existing.betrag) {
            updateFields.betrag = effektiverBetrag;
            if (istNetto) updateFields.betrag_ist_netto = true;
          }
        }
      }

      await supabase.from("bestellungen").update(updateFields).eq("id", bestellungId);

      gespeicherteTypen.push(analyse.typ);
      dokumenteGespeichert++;
    }

    // =====================================================================
    // ROLLBACK: Sekundäre Dokumente dürfen keine neue Bestellung erstellen
    // Lieferschein + Versandbestätigung sind nur gültig wenn bereits eine
    // Bestellung existiert (mit Best.bestätigung, Rechnung, Aufmaß o.ä.)
    // =====================================================================
    const PRIMAER_TYPEN = ["bestellbestaetigung", "rechnung", "aufmass", "leistungsnachweis"];
    if (bestellungNeuErstellt && dokumenteGespeichert > 0) {
      const hatPrimaerDokument = gespeicherteTypen.some(t => PRIMAER_TYPEN.includes(t));
      if (!hatPrimaerDokument) {
        logInfo("webhook/email", "Rollback: Nur sekundäre Dokumente (LS/VS) ohne bestehende Bestellung", {
          bestellungId, typen: gespeicherteTypen, email_absender, email_betreff,
        });
        await supabase.from("dokumente").delete().eq("bestellung_id", bestellungId);
        await supabase.from("bestellungen").delete().eq("id", bestellungId);
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: "sekundaer_ohne_bestellung",
          debug: { typen: gespeicherteTypen },
        });
      }
    }

    // =====================================================================
    // E-MAIL BODY ALS ERGÄNZUNG ANALYSIEREN
    // =====================================================================
    if (emailText && emailText.length > 100) {
      try {
        // Nur wenn noch Zeit übrig ist (< 45s verbraucht)
        if (Date.now() - startTime < 45_000) {
          // Betreff als Kontext mitgeben — GPT braucht den Betreff um den Dokumenttyp korrekt zu erkennen
          // z.B. "Ihre Bestellung bei Strauss" = Bestellbestätigung, nicht Versandbestätigung
          const bodyMitBetreff = email_betreff
            ? `E-Mail Betreff: ${email_betreff}\nAbsender: ${email_absender || ""}\n\n${emailText.slice(0, 15000)}`
            : emailText.slice(0, 15000);
          const bodyBase64 = Buffer.from(bodyMitBetreff).toString("base64");
          const bodyAnalyse = await analysiereDokument(bodyBase64, "text/plain");

          // Betreff-basierte Korrektur: Wenn der Betreff klar einen Typ signalisiert, GPT aber etwas anderes sagt
          if (email_betreff) {
            const betreffLower = email_betreff.toLowerCase();
            const betreffIstBestellung = ["ihre bestellung", "bestellbestätigung", "auftragsbestätigung", "order confirmation", "bestellung eingegangen", "bestellung bei"].some(kw => betreffLower.includes(kw));
            if (betreffIstBestellung && bodyAnalyse.typ === "versandbestaetigung") {
              logInfo("webhook/email", "Betreff-Korrektur: GPT sagte versandbestaetigung, Betreff sagt bestellbestaetigung", { email_betreff, gpt_typ: bodyAnalyse.typ });
              bodyAnalyse.typ = "bestellbestaetigung";
            }
          }

          // Versandbestätigung aus Body darf keine neue Bestellung erstellen
          if (bodyAnalyse.typ === "versandbestaetigung" && bestellungNeuErstellt && dokumenteGespeichert === 0) {
            logInfo("webhook/email", "Rollback: Body-only Versandbestätigung ohne bestehende Bestellung", {
              bestellungId, email_absender, email_betreff,
            });
            await supabase.from("dokumente").delete().eq("bestellung_id", bestellungId);
            await supabase.from("bestellungen").delete().eq("id", bestellungId);
            return NextResponse.json({
              success: true,
              skipped: true,
              reason: "versand_body_ohne_bestellung",
            });
          }

          if (bekannteTypen.includes(bodyAnalyse.typ) && !gespeicherteTypen.includes(bodyAnalyse.typ)) {
            // Neuer Typ aus Body → speichern
            await supabase.from("dokumente").insert({
              bestellung_id: bestellungId,
              typ: bodyAnalyse.typ,
              quelle: "email",
              storage_pfad: null,
              email_betreff,
              email_absender,
              email_datum,
              ki_roh_daten: bodyAnalyse,
              bestellnummer_erkannt: bodyAnalyse.bestellnummer,
              auftragsnummer: bodyAnalyse.auftragsnummer || null,
              lieferscheinnummer: bodyAnalyse.lieferscheinnummer || null,
              artikel: bodyAnalyse.artikel,
              gesamtbetrag: bodyAnalyse.gesamtbetrag,
              netto: bodyAnalyse.netto,
              mwst: bodyAnalyse.mwst,
              faelligkeitsdatum: bodyAnalyse.faelligkeitsdatum,
              lieferdatum: bodyAnalyse.lieferdatum,
              iban: bodyAnalyse.iban,
              kundennummer: bodyAnalyse.kundennummer || null,
              besteller_im_dokument: bodyAnalyse.besteller_im_dokument || null,
              projekt_referenz: bodyAnalyse.projekt_referenz || null,
              bestelldatum: bodyAnalyse.bestelldatum || null,
            });

            const bodyUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
            const flagMap: Record<string, string> = {
              bestellbestaetigung: "hat_bestellbestaetigung",
              lieferschein: "hat_lieferschein",
              rechnung: "hat_rechnung",
              aufmass: "hat_aufmass",
              leistungsnachweis: "hat_leistungsnachweis",
              versandbestaetigung: "hat_versandbestaetigung",
            };
            if (flagMap[bodyAnalyse.typ]) bodyUpdate[flagMap[bodyAnalyse.typ]] = true;
            if (bodyAnalyse.typ !== "versandbestaetigung") {
              if (bodyAnalyse.bestellnummer) bodyUpdate.bestellnummer = bodyAnalyse.bestellnummer;
              if (bodyAnalyse.auftragsnummer) bodyUpdate.auftragsnummer = bodyAnalyse.auftragsnummer;
              if (bodyAnalyse.lieferscheinnummer) bodyUpdate.lieferscheinnummer = bodyAnalyse.lieferscheinnummer;
              // Betrag: Rechnung ist maßgeblich, andere Typen nur wenn noch kein Betrag in DB
              // Fallback: netto verwenden wenn gesamtbetrag null (z.B. steuerfreie innergemeinschaftliche Lieferung)
              const bodyEffektiverBetrag = bodyAnalyse.gesamtbetrag != null ? bodyAnalyse.gesamtbetrag : (bodyAnalyse.netto ?? null);
              const bodyIstNetto = !bodyAnalyse.gesamtbetrag && !!bodyAnalyse.netto;
              if (bodyEffektiverBetrag && bodyAnalyse.typ === "rechnung") {
                bodyUpdate.betrag = bodyEffektiverBetrag;
                if (bodyIstNetto) bodyUpdate.betrag_ist_netto = true;
              } else if (bodyEffektiverBetrag) {
                const { data: existing } = await supabase
                  .from("bestellungen")
                  .select("betrag")
                  .eq("id", bestellungId)
                  .maybeSingle();
                if (existing && !existing.betrag) {
                  bodyUpdate.betrag = bodyEffektiverBetrag;
                  if (bodyIstNetto) bodyUpdate.betrag_ist_netto = true;
                }
              }
            }

            // Händlername aus Body-Analyse übernehmen wenn noch fehlend oder nur Domain
            if (bodyAnalyse.haendler && (!haendlerName || haendlerName === absenderDomain || haendlerName === "")) {
              bodyUpdate.haendler_name = bodyAnalyse.haendler;
              haendlerName = bodyAnalyse.haendler;
              logInfo("webhook/email", `Händlername aus Body-Analyse übernommen: ${bodyAnalyse.haendler}`);
            }

            await supabase.from("bestellungen").update(bodyUpdate).eq("id", bestellungId);
            dokumenteGespeichert++;
            gespeicherteTypen.push(bodyAnalyse.typ);
          } else if (bekannteTypen.includes(bodyAnalyse.typ)) {
            // Typ schon aus Anhang vorhanden → fehlende Felder ergänzen
            const ergaenzung: Record<string, unknown> = {};
            if (bodyAnalyse.bestellnummer && bodyAnalyse.typ !== "versandbestaetigung") {
              // Bestellnummer nur ergänzen wenn noch keine da
              const { data: check } = await supabase
                .from("bestellungen")
                .select("bestellnummer")
                .eq("id", bestellungId)
                .maybeSingle();
              if (check && !check.bestellnummer) ergaenzung.bestellnummer = bodyAnalyse.bestellnummer;
            }
            if (bodyAnalyse.typ !== "versandbestaetigung") {
              const ergBetrag = bodyAnalyse.gesamtbetrag != null ? bodyAnalyse.gesamtbetrag : (bodyAnalyse.netto ?? null);
              if (ergBetrag) {
                const { data: check } = await supabase
                  .from("bestellungen")
                  .select("betrag")
                  .eq("id", bestellungId)
                  .maybeSingle();
                if (check && !check.betrag) {
                  ergaenzung.betrag = ergBetrag;
                  if (!bodyAnalyse.gesamtbetrag && !!bodyAnalyse.netto) ergaenzung.betrag_ist_netto = true;
                }
              }
            }
            // Händlername ergänzen wenn noch fehlend
            if (bodyAnalyse.haendler && (!haendlerName || haendlerName === absenderDomain || haendlerName === "")) {
              ergaenzung.haendler_name = bodyAnalyse.haendler;
            }
            if (Object.keys(ergaenzung).length > 0) {
              await supabase.from("bestellungen").update(ergaenzung).eq("id", bestellungId);
            }
          }
        } else {
          logInfo("webhook/email", "Body-Analyse übersprungen (Timeout-Schutz)", {
            dauer_ms: Date.now() - startTime,
          });
        }
      } catch (bodyErr) {
        logError("webhook/email", "Body-Analyse fehlgeschlagen", bodyErr);
      }
    }

    // =====================================================================
    // FALLBACK: Kein Dokument gespeichert
    // =====================================================================
    if (dokumenteGespeichert === 0) {
      if (emailText && emailText.length > 20) {
        // Keyword-basierte Typ-Erkennung (kein GPT, instant)
        const suchText = ((email_betreff || "") + " " + emailText.slice(0, 500)).toLowerCase();

        let fallbackTyp: string;
        let fallbackFlag: string;

        // Reihenfolge wichtig: Bestellbestätigung VOR Versand prüfen,
        // weil "Ihre Bestellung" (= Bestätigung) stärker ist als generische Versand-Keywords
        const bestellungKw = ["bestellbestätigung", "bestellbestaetigung", "auftragsbestätigung", "order confirmation", "ihre bestellung", "bestellung eingegangen", "bestellung bei"];
        const rechnungKw = ["rechnung", "invoice", "zahlungsaufforderung", "fällig", "rechnungsnummer", "zahlungsziel"];
        const lieferscheinKw = ["lieferschein", "lieferung", "delivery note", "warenausgang"];
        const versandKw = ["versandbestätigung", "versandbestaetigung", "versendet", "sendungsverfolgung", "tracking", "shipped", "zustellung", "unterwegs", "paket wurde", "sendung verfolgen"];

        if (bestellungKw.some((k) => suchText.includes(k))) {
          fallbackTyp = "bestellbestaetigung";
          fallbackFlag = "hat_bestellbestaetigung";
        } else if (rechnungKw.some((k) => suchText.includes(k))) {
          fallbackTyp = "rechnung";
          fallbackFlag = "hat_rechnung";
        } else if (lieferscheinKw.some((k) => suchText.includes(k))) {
          fallbackTyp = "lieferschein";
          fallbackFlag = "hat_lieferschein";
        } else if (versandKw.some((k) => suchText.includes(k))) {
          fallbackTyp = "versandbestaetigung";
          fallbackFlag = "hat_versandbestaetigung";
        } else {
          // Kein Keyword erkannt → NICHT als Bestellbestätigung speichern
          // Stattdessen: Bestellung löschen wenn neu erstellt (irrelevante Email)
          if (bestellungNeuErstellt) {
            logInfo("webhook/email", "Rollback: Body-only ohne erkannten Typ", { bestellungId, email_absender, email_betreff });
            await supabase.from("dokumente").delete().eq("bestellung_id", bestellungId);
            await supabase.from("bestellungen").delete().eq("id", bestellungId);
          }
          return NextResponse.json({
            success: true,
            skipped: true,
            reason: "kein_dokument_erkannt",
            debug: { email_betreff, email_absender },
          });
        }

        // Sekundäre Dokumente (LS/VS): NUR an bestehende Bestellung anhängen, keine neue erstellen
        if ((fallbackTyp === "versandbestaetigung" || fallbackTyp === "lieferschein") && bestellungNeuErstellt) {
          logInfo("webhook/email", `Rollback: ${fallbackTyp} ohne bestehende Bestellung`, { bestellungId, email_absender, email_betreff });
          await supabase.from("dokumente").delete().eq("bestellung_id", bestellungId);
          await supabase.from("bestellungen").delete().eq("id", bestellungId);
          return NextResponse.json({
            success: true,
            skipped: true,
            reason: "sekundaer_ohne_bestellung",
          });
        }

        // Tracking-Daten extrahieren bei Versand-Emails
        const bestellungUpdate: Record<string, unknown> = {
          [fallbackFlag]: true,
          updated_at: new Date().toISOString(),
        };

        if (fallbackTyp === "versandbestaetigung") {
          const trackingMatch = emailText.match(/(?:sendungsnummer|tracking[- ]?(?:nr|nummer|number|id|code)|paketnummer)[:\s]*([A-Z0-9]{8,30})/i);
          if (trackingMatch) bestellungUpdate.tracking_nummer = trackingMatch[1];

          const carriers = [
            { name: "DHL", pattern: /\bDHL\b/i },
            { name: "DPD", pattern: /\bDPD\b/i },
            { name: "Hermes", pattern: /\bHermes\b/i },
            { name: "UPS", pattern: /\bUPS\b/i },
            { name: "GLS", pattern: /\bGLS\b/i },
          ];
          const carrier = carriers.find((c) => c.pattern.test(emailText));
          if (carrier) bestellungUpdate.versanddienstleister = carrier.name;

          const urlMatch = emailText.match(/https?:\/\/[^\s"'<>]+(?:track|sendung|parcel|verfolg)[^\s"'<>]*/i);
          if (urlMatch) bestellungUpdate.tracking_url = urlMatch[0];
          else if (carrier && trackingMatch) {
            const autoUrl = buildTrackingUrl(carrier.name, trackingMatch[1]);
            if (autoUrl) bestellungUpdate.tracking_url = autoUrl;
          }
        }

        await supabase.from("dokumente").insert({
          bestellung_id: bestellungId,
          typ: fallbackTyp,
          quelle: "email",
          storage_pfad: null,
          email_betreff,
          email_absender,
          email_datum,
          ki_roh_daten: { typ: fallbackTyp, quelle: "email_body", email_text: emailText.slice(0, 5000) },
          bestellnummer_erkannt: null,
          artikel: null,
          gesamtbetrag: null,
          netto: null,
          mwst: null,
          faelligkeitsdatum: null,
          lieferdatum: null,
          iban: null,
        });

        await supabase.from("bestellungen").update(bestellungUpdate).eq("id", bestellungId);
        dokumenteGespeichert = 1;
      } else if (bestellungNeuErstellt) {
        // Rollback: Keine Daten → Bestellung löschen
        logError("webhook/email", "Rollback: Keine Dokumente", { bestellungId, email_absender, email_betreff });
        await supabase.from("dokumente").delete().eq("bestellung_id", bestellungId);
        await supabase.from("bestellungen").delete().eq("id", bestellungId);
        return NextResponse.json({
          error: "Keine Dokumente konnten gespeichert werden",
          debug: { anhaenge_empfangen: anhaenge.length, email_text_laenge: emailText.length },
        }, { status: 500 });
      }
    }

    // =====================================================================
    // HÄNDLER AUTO-ERKENNUNG (nur wenn noch nicht bekannt + noch Zeit)
    // =====================================================================
    if (!haendler && analyseErgebnisse.length > 0 && (Date.now() - startTime) < 50_000) {
      try {
        const erkannterHaendlerName = analyseErgebnisse.find((e) => e.analyse.haendler)?.analyse.haendler || null;
        const neuerHaendler = await erkenneHaendlerAusEmail(email_absender, email_betreff, erkannterHaendlerName);

        if (neuerHaendler) {
          const { data: existing } = await supabase
            .from("haendler")
            .select("id")
            .eq("domain", neuerHaendler.domain)
            .limit(1);

          if (!existing || existing.length === 0) {
            await supabase.from("haendler").insert({
              name: neuerHaendler.name,
              domain: neuerHaendler.domain,
              email_absender: [neuerHaendler.email_muster],
              url_muster: [],
            });

            // Bestellung mit neuem Händlernamen updaten
            await supabase
              .from("bestellungen")
              .update({ haendler_name: neuerHaendler.name })
              .eq("id", bestellungId);

            logInfo("webhook/email", `Neuer Händler: ${neuerHaendler.name}`, { domain: neuerHaendler.domain });
          }
        }
      } catch (err) {
        logError("webhook/email", "Händler-Erkennung fehlgeschlagen", err);
      }
    }

    // =====================================================================
    // STATUS AKTUALISIEREN
    // =====================================================================
    await updateBestellungStatus(supabase, bestellungId);

    // =====================================================================
    // ABO-LOGIK: Betragsabweichung prüfen + nächste Rechnung weiterschalten
    // =====================================================================
    if (bestellungsart === "abo") {
      // Abo-Anbieter aus DB laden (für Betragsprüfung und Intervall)
      // Abo-Anbieter laden: zuerst per Domain, dann per Name
      let abo = (await supabase
        .from("abo_anbieter")
        .select("*")
        .eq("domain", haendlerDomain)
        .maybeSingle()).data;

      if (!abo && haendlerName) {
        abo = (await supabase
          .from("abo_anbieter")
          .select("*")
          .ilike("name", `%${haendlerName}%`)
          .maybeSingle()).data;
      }

      if (abo) {
        // Betrag der aktuellen Rechnung holen
        const { data: bestellung } = await supabase
          .from("bestellungen")
          .select("betrag")
          .eq("id", bestellungId)
          .maybeSingle();

        const aktuellerBetrag = bestellung?.betrag ? Number(bestellung.betrag) : null;

        // 1. Betragsabweichung prüfen
        if (abo.erwarteter_betrag && aktuellerBetrag) {
          const toleranz = (abo.toleranz_prozent || 10) / 100;
          const abweichung = Math.abs(aktuellerBetrag - Number(abo.erwarteter_betrag)) / Number(abo.erwarteter_betrag);
          if (abweichung > toleranz) {
            await supabase.from("bestellungen").update({ status: "abweichung" }).eq("id", bestellungId);
            await supabase.from("kommentare").insert({
              bestellung_id: bestellungId,
              autor_kuerzel: "SYSTEM",
              autor_name: "Abo-Prüfung",
              text: `Abo-Betragsabweichung erkannt!\nErwartet: ${Number(abo.erwarteter_betrag).toLocaleString("de-DE", { minimumFractionDigits: 2 })} € (±${abo.toleranz_prozent || 10}%)\nErhalten: ${aktuellerBetrag.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €\nAbweichung: ${(abweichung * 100).toFixed(1)}%`,
            });
            logInfo("webhook/email", `Abo-Abweichung: ${abo.name}`, { erwartet: abo.erwarteter_betrag, erhalten: aktuellerBetrag });
          } else {
            // Betrag stimmt → Status auf vollstaendig setzen (löst auch alte "abweichung" auf)
            await supabase.from("bestellungen").update({ status: "vollstaendig" }).eq("id", bestellungId);
          }
        } else {
          // Kein erwarteter Betrag hinterlegt → Abo-Rechnung ist sofort vollständig
          await supabase.from("bestellungen").update({ status: "vollstaendig" }).eq("id", bestellungId);
        }

        // 2. Nächste Rechnung weiterschalten (vom geplanten Datum, nicht von heute — verhindert Drift)
        const intervallMonate: Record<string, number> = { monatlich: 1, quartalsweise: 3, halbjaehrlich: 6, jaehrlich: 12 };
        const monate = intervallMonate[abo.intervall] || 1;
        const heute = new Date();
        let naechste: Date;
        if (abo.naechste_rechnung) {
          // Vom geplanten Datum weiterschalten (kein Drift)
          const geplant = new Date(abo.naechste_rechnung);
          naechste = new Date(geplant.getFullYear(), geplant.getMonth() + monate, geplant.getDate());
        } else {
          naechste = new Date(heute.getFullYear(), heute.getMonth() + monate, heute.getDate());
        }

        await supabase.from("abo_anbieter").update({
          naechste_rechnung: naechste.toISOString().split("T")[0],
          letzte_rechnung_am: heute.toISOString().split("T")[0],
          letzter_betrag: aktuellerBetrag,
        }).eq("id", abo.id);
      }
    }

    // Signal mit Bestellung verknüpfen
    if (signal) {
      await supabase.from("bestellung_signale")
        .update({ matched_bestellung_id: bestellungId })
        .eq("id", signal.id);
    }

    // Admin-Hinweis bei UNBEKANNT
    if (bestellerKuerzel === "UNBEKANNT") {
      await supabase.from("kommentare").insert({
        bestellung_id: bestellungId,
        autor_kuerzel: "SYSTEM",
        autor_name: "Zuordnungs-Assistent",
        text: `Bestellung konnte keinem Besteller zugeordnet werden.\nHändler: ${haendlerName}\nAbsender: ${email_absender}\nBetreff: ${email_betreff || "–"}\n\nBitte manuell zuordnen.`,
      });
    }

    // Webhook-Log: Erfolg
    await supabase.from("webhook_logs").insert({
      typ: "email",
      status: "success",
      bestellung_id: bestellungId,
      bestellnummer: erkannteBestellnummer || null,
    });

    const dauer = Date.now() - startTime;
    logInfo("webhook/email", `Fertig in ${dauer}ms`, {
      bestellungId,
      dokumente: dokumenteGespeichert,
      besteller: bestellerKuerzel,
      methode: zuordnungsMethode,
      haendler: haendlerName,
    });

    return NextResponse.json({
      success: true,
      bestellung_id: bestellungId,
      zuordnung: { methode: zuordnungsMethode, kuerzel: bestellerKuerzel },
      dokumente_gespeichert: dokumenteGespeichert,
      dauer_ms: dauer,
      debug_anhaenge: {
        raw_empfangen: Array.isArray(rawAnhaenge) ? rawAnhaenge.length : 0,
        nach_filter: anhaenge.length,
        analysiert: analyseErgebnisse.length,
      },
    });
  } catch (err) {
    logError("webhook/email", "Webhook Fehler", err);
    try {
      const supabase = createServiceClient();
      await supabase.from("webhook_logs").insert({
        typ: "email",
        status: "error",
        fehler_text: err instanceof Error ? err.message : String(err),
      });
    } catch { /* ignore */ }

    return NextResponse.json(
      { error: "Interner Fehler" },
      { status: 500 }
    );
  }
}

// =====================================================================
// VERSAND-EMAILS: An existierende Bestellung anhängen
// =====================================================================
async function handleVersandEmail(
  supabase: ReturnType<typeof createServiceClient>,
  params: {
    email_betreff: string;
    email_absender: string;
    email_datum: string;
    emailText: string;
    anhaenge: { name: string; base64: string; mime_type: string }[];
    absenderDomain: string;
    startTime: number;
  }
) {
  const { email_betreff, email_absender, email_datum, emailText, anhaenge, absenderDomain, startTime } = params;

  logInfo("webhook/email", `Versand-Email von ${absenderDomain}`, { email_betreff });

  // Tracking-Daten aus Body extrahieren (kein GPT nötig)
  let trackingNummer: string | null = null;
  let versanddienstleister: string | null = null;
  let trackingUrl: string | null = null;

  // Tracking-Nummer
  const trackingMatch = emailText.match(/(?:sendungsnummer|tracking[- ]?(?:nr|nummer|number|id|code)|paketnummer|shipment)[:\s]*([A-Z0-9]{8,30})/i);
  if (trackingMatch) trackingNummer = trackingMatch[1];

  // Carrier
  const carriers = [
    { name: "DHL", pattern: /\bDHL\b/i },
    { name: "DPD", pattern: /\bDPD\b/i },
    { name: "Hermes", pattern: /\bHermes\b/i },
    { name: "UPS", pattern: /\bUPS\b/i },
    { name: "GLS", pattern: /\bGLS\b/i },
    { name: "FedEx", pattern: /\bFedEx\b/i },
    { name: "Deutsche Post", pattern: /\bDeutsche Post\b/i },
  ];
  const carrier = carriers.find((c) => c.pattern.test(emailText));
  if (carrier) versanddienstleister = carrier.name;
  else if (absenderDomain.includes("dhl")) versanddienstleister = "DHL";
  else if (absenderDomain.includes("dpd")) versanddienstleister = "DPD";
  else if (absenderDomain.includes("hermes")) versanddienstleister = "Hermes";
  else if (absenderDomain.includes("ups")) versanddienstleister = "UPS";
  else if (absenderDomain.includes("gls")) versanddienstleister = "GLS";

  // Tracking-URL
  const urlMatch = emailText.match(/https?:\/\/[^\s"'<>]+(?:track|sendung|parcel|verfolg)[^\s"'<>]*/i);
  if (urlMatch) trackingUrl = urlMatch[0];
  else if (versanddienstleister && trackingNummer) {
    trackingUrl = buildTrackingUrl(versanddienstleister, trackingNummer) || null;
  }

  // Bestellnummer aus Betreff oder Body extrahieren
  const bestellnrMatch = emailText.match(/(?:bestellnummer|bestellung|order|auftrag)[:\s#]*([A-Z0-9-]{4,30})/i)
    || (email_betreff || "").match(/(?:bestellnummer|bestellung|order|auftrag)[:\s#]*([A-Z0-9-]{4,30})/i);

  let bestellungId: string | null = null;

  // Zuordnung: Bestellnummer-Match
  if (bestellnrMatch) {
    const { data } = await supabase
      .from("bestellungen")
      .select("id")
      .eq("bestellnummer", bestellnrMatch[1])
      .limit(1)
      .maybeSingle();
    if (data) bestellungId = data.id;
  }

  if (!bestellungId) {
    // Fallback: Letzte offene Material-Bestellung der letzten 7 Tage,
    // die NOCH KEINE Versandbestätigung hat.
    // Zusätzlich: Wenn der Versanddienstleister aus der Domain erkennbar ist (z.B. dhl.de),
    // können wir NICHT auf den Händler filtern — Versand-Emails kommen vom Carrier, nicht vom Händler.
    // Deshalb: Nur Bestellungen nehmen die hat_versandbestaetigung = false haben.
    const siebenTageZurueck = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: kandidaten } = await supabase
      .from("bestellungen")
      .select("id, hat_versandbestaetigung, hat_bestellbestaetigung")
      .in("status", ["offen", "erwartet", "vollstaendig"])
      .eq("bestellungsart", "material")
      .eq("hat_versandbestaetigung", false)
      .gte("created_at", siebenTageZurueck)
      .order("created_at", { ascending: false })
      .limit(5);

    if (kandidaten && kandidaten.length === 1) {
      // Eindeutig: Nur eine offene Bestellung ohne Versand → zuordnen
      bestellungId = kandidaten[0].id;
    } else if (kandidaten && kandidaten.length > 1) {
      // Mehrere Kandidaten: Bevorzuge Bestellungen die bereits eine Bestätigung haben
      // (= weiter im Prozess, wahrscheinlicher dass Versand kommt)
      const mitBestaetigung = kandidaten.find(k => k.hat_bestellbestaetigung);
      if (mitBestaetigung) {
        bestellungId = mitBestaetigung.id;
      }
      // Bei mehreren Kandidaten OHNE klare Zuordnung: NICHT raten → lieber verwerfen
      // als falsch zuordnen
    }
  }

  if (!bestellungId) {
    // Keine passende Bestellung → Tracking-Info ohne Bestellung loggen und verwerfen
    logInfo("webhook/email", "Versand-Email ohne zugehörige Bestellung verworfen", {
      tracking: trackingNummer,
      carrier: versanddienstleister,
    });
    return NextResponse.json({ success: true, skipped: true, reason: "versand_ohne_bestellung" });
  }

  // Tracking-Daten in Bestellung speichern
  const update: Record<string, unknown> = {
    hat_versandbestaetigung: true,
    updated_at: new Date().toISOString(),
  };
  if (trackingNummer) update.tracking_nummer = trackingNummer;
  if (versanddienstleister) update.versanddienstleister = versanddienstleister;
  if (trackingUrl) update.tracking_url = trackingUrl;

  await supabase.from("bestellungen").update(update).eq("id", bestellungId);

  // Dokument speichern
  await supabase.from("dokumente").insert({
    bestellung_id: bestellungId,
    typ: "versandbestaetigung",
    quelle: "email",
    storage_pfad: null,
    email_betreff,
    email_absender,
    email_datum,
    ki_roh_daten: { typ: "versandbestaetigung", tracking_nummer: trackingNummer, versanddienstleister, tracking_url: trackingUrl },
    bestellnummer_erkannt: bestellnrMatch?.[1] || null,
    artikel: null,
    gesamtbetrag: null,
    netto: null,
    mwst: null,
    faelligkeitsdatum: null,
    lieferdatum: null,
    iban: null,
  });

  // Wenn Anhänge vorhanden (z.B. Versandlabel als PDF) → speichern
  for (const anhang of anhaenge.slice(0, 1)) {
    const storagePfad = `${bestellungId}/versand_${Date.now()}_${anhang.name}`;
    const buffer = Buffer.from(anhang.base64, "base64");
    const { error: uploadErr } = await supabase.storage
      .from("dokumente")
      .upload(storagePfad, buffer, { contentType: anhang.mime_type, upsert: true });
    if (uploadErr) {
      logError("webhook/email", `Versand-Anhang Upload fehlgeschlagen: ${anhang.name}`, uploadErr);
    } else {
      // Storage-Pfad im Dokument-Eintrag nachtragen
      await supabase.from("dokumente")
        .update({ storage_pfad: storagePfad })
        .eq("bestellung_id", bestellungId)
        .eq("typ", "versandbestaetigung")
        .is("storage_pfad", null);
    }
  }

  await updateBestellungStatus(supabase, bestellungId);

  logInfo("webhook/email", `Versand-Info gespeichert`, {
    bestellungId,
    tracking: trackingNummer,
    carrier: versanddienstleister,
    dauer_ms: Date.now() - startTime,
  });

  return NextResponse.json({
    success: true,
    bestellung_id: bestellungId,
    versand: { tracking_nummer: trackingNummer, versanddienstleister, tracking_url: trackingUrl },
  });
}
