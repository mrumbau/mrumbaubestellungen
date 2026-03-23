import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { IRRELEVANT_DOMAINS, VERSAND_DOMAINS } from "@/lib/blacklist-constants";
import { safeCompare } from "@/lib/safe-compare";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import OpenAI from "openai";

// Leichtgewichtiger Pre-Check für Make.com
// Prüft ob eine Email verarbeitet werden soll BEVOR Anhänge geladen werden.
// Checkt: Händler-DB, Subunternehmer-DB, Blacklist, Freemail, System-Mails, GPT-Fallback

const FREEMAIL_DOMAINS = new Set([
  ...IRRELEVANT_DOMAINS,
  "aol.com", "aol.de", "live.com", "live.de", "msn.com",
  "posteo.de", "mailbox.org", "tutanota.com", "zoho.com",
]);

const SYSTEM_KEYWORDS = [
  "fritz!", "fritzbox", "repeater-info", "verbindungsdaten",
  "synology", "nas-benachrichtigung", "ups-status",
  "druckerinfo", "printer notification", "scanner",
  "cron daemon", "logwatch", "fail2ban",
  "out of office", "abwesenheit", "automatic reply", "automatische antwort",
  "undeliverable", "delivery failure", "mail delivery failed",
  "calendar:", "einladung:", "termineinladung",
  "newsletter", "abonnement", "unsubscribe", "abmelden",
];

function extractEmailAddress(raw: string): string {
  if (!raw) return "";
  const match = raw.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return match ? match[0].toLowerCase() : raw.toLowerCase();
}

function extractDomain(raw: string): string {
  const addr = extractEmailAddress(raw);
  return addr.split("@")[1] || "";
}

export async function POST(request: NextRequest) {
  try {
    // Rate-Limiting: 30/min (leichtgewichtig)
    const rlKey = getRateLimitKey(request, "email-check");
    const rl = checkRateLimit(rlKey, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Zu viele Anfragen" }, { status: 429 });
    }

    const body = await request.json();
    const { secret, email_absender, email_betreff, email_vorschau } = body;

    // Secret prüfen
    if (!safeCompare(secret, process.env.MAKE_WEBHOOK_SECRET)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const absenderAdresse = extractEmailAddress(email_absender || "");
    const absenderDomain = extractDomain(email_absender || "");
    const betreff = (email_betreff || "").toLowerCase();
    const vorschau = (email_vorschau || "").toLowerCase();

    // ── 1. Kein gültiger Absender ──
    if (!absenderAdresse || !absenderAdresse.includes("@") || !absenderDomain.includes(".")) {
      return NextResponse.json({ relevant: false, grund: "kein_absender" });
    }

    // ── 2. System-Mails (Geräte, Bounces, Kalender) ──
    if (SYSTEM_KEYWORDS.some(k => betreff.includes(k) || absenderAdresse.includes(k))) {
      return NextResponse.json({ relevant: false, grund: "system_mail" });
    }

    const supabase = createServiceClient();

    // ── 3. Blacklist aus DB ──
    const { data: blacklist } = await supabase.from("email_blacklist").select("muster, typ");
    if (blacklist && blacklist.length > 0) {
      const istBlockiert = blacklist.some((bl) => {
        const muster = bl.muster.toLowerCase();
        if (bl.typ === "adresse") return absenderAdresse === muster;
        return absenderDomain === muster || absenderDomain.endsWith("." + muster);
      });
      if (istBlockiert) {
        return NextResponse.json({ relevant: false, grund: "blacklist" });
      }
    }

    // ── 4. Bekannter Händler? ──
    const { data: haendlerListe } = await supabase
      .from("haendler")
      .select("id, name, domain, email_absender");

    const haendlerMatch = haendlerListe?.find((h) => {
      // Email-Match
      if (h.email_absender?.some((addr: string) => {
        const norm = addr.toLowerCase().trim();
        if (norm.startsWith("*@")) return absenderAdresse.endsWith("@" + norm.slice(2));
        return absenderAdresse === norm;
      })) return true;
      // Domain-Match
      const hDomain = h.domain?.toLowerCase();
      if (hDomain && (absenderDomain === hDomain || absenderDomain.endsWith("." + hDomain))) return true;
      return false;
    });

    if (haendlerMatch) {
      return NextResponse.json({
        relevant: true,
        grund: "haendler",
        haendler_name: haendlerMatch.name,
        haendler_id: haendlerMatch.id,
      });
    }

    // ── 5. Bekannter Subunternehmer? ──
    const { data: suListe } = await supabase
      .from("subunternehmer")
      .select("id, firma, email_absender");

    const suMatch = suListe?.find((su) =>
      su.email_absender?.some((addr: string) => {
        const norm = addr.toLowerCase().trim();
        if (norm.startsWith("*@")) return absenderAdresse.endsWith("@" + norm.slice(2));
        return absenderAdresse === norm;
      })
    );

    if (suMatch) {
      return NextResponse.json({
        relevant: true,
        grund: "subunternehmer",
        su_name: suMatch.firma,
        su_id: suMatch.id,
      });
    }

    // ── 6. Versand-Domain? ──
    const versandDomains = new Set(VERSAND_DOMAINS);
    const istVersand = versandDomains.has(absenderDomain) ||
      [...versandDomains].some(d => absenderDomain.endsWith("." + d));
    if (istVersand) {
      return NextResponse.json({ relevant: true, grund: "versand" });
    }

    // ── 7. Freemail → NEIN (nach Händler/SU-Check, falls z.B. feistbaur@t-online.de bekannt) ──
    if (FREEMAIL_DOMAINS.has(absenderDomain) ||
        [...FREEMAIL_DOMAINS].some(d => absenderDomain.endsWith("." + d))) {
      return NextResponse.json({ relevant: false, grund: "freemail" });
    }

    // ── 8. Unbekannter Absender → GPT-4o-mini entscheidet ──
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const gptResult = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 150,
        messages: [
          {
            role: "system",
            content: `Du bist ein E-Mail-Klassifizierer für eine deutsche Baufirma (MR Umbau GmbH).
Entscheide ob diese E-Mail geschäftsrelevant ist und verarbeitet werden soll.

RELEVANT (ja):
- Bestellbestätigungen, Auftragsbestätigungen
- Rechnungen, Gutschriften
- Lieferscheine, Versandbestätigungen
- Angebote von Lieferanten/Händlern
- Aufmaße, Leistungsnachweise
- Mahnungen, Zahlungserinnerungen

IRRELEVANT (nein):
- Newsletter, Werbung, Marketing
- Spam, Phishing
- Persönliche Emails, Kundenanfragen
- Geräte-Benachrichtigungen (Router, NAS, Drucker)
- Social Media, Kalendereinladungen
- Bewerbungen, Stellenangebote
- Interne System-Mails

Antworte NUR mit JSON: {"relevant": true/false, "grund": "kurze Begründung"}`,
          },
          {
            role: "user",
            content: `Absender: ${email_absender}\nBetreff: ${email_betreff}\nVorschau: ${(email_vorschau || "").substring(0, 500)}`,
          },
        ],
      });

      const gptText = gptResult.choices[0]?.message?.content || "";
      const jsonMatch = gptText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return NextResponse.json({
          relevant: !!parsed.relevant,
          grund: parsed.relevant ? "ki_ja" : "ki_nein",
          ki_begruendung: parsed.grund || null,
        });
      }
    } catch {
      // GPT-Fehler → sicherheitshalber durchlassen
    }

    // Fallback: unbekannt → durchlassen (besser eine irrelevante Email verarbeiten als eine wichtige verpassen)
    return NextResponse.json({ relevant: true, grund: "unbekannt_fallback" });
  } catch {
    // Bei Fehler durchlassen
    return NextResponse.json({ relevant: true, grund: "fehler_fallback" });
  }
}
