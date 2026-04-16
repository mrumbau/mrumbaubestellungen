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
  // Telefon-/VoIP-Systeme
  "verpasster anruf", "missed call", "voicemail", "3cx",
  // Lesebestätigungen
  "gelesen:", "read:", "lesebestätigung", "read receipt",
  // Hosting/Service-Benachrichtigungen
  "kontoinformation", "account information",
  // Werbung/Marketing allgemein
  "profinews", "produktneuheiten", "firmendaten aktualisieren",
  "jetzt online", "vorteil sichern",
  // Lohn/Gehalt/Steuer (Steuerkanzlei, Lohnbüro)
  "lohnabrechnung", "lohnauswertung", "entgeltabrechnung", "gehaltsabrechnung",
  "lohn auswertung", "lohnsteuer", "lohnnachweis", "brutto/netto",
  "sozialversicherungsmeldung", "sv-meldung", "beitragsnachweis",
];

// Domains die IMMER irrelevant sind (Telefon, Hosting, Auskunfteien etc.)
const SYSTEM_DOMAINS = new Set([
  "3cx.net", "3cx.com",
  "creditreform.de", "muenchen.creditreform.de",
  "all-inkl.com",
  // DATEV System-Mails (Belegupload-Bestätigungen, Unternehmen Online Benachrichtigungen)
  "datev.de", "uploadmail.datev.de",
]);

// Marketing/Transaktions-Mails von Händlern die KEINE Geschäftsdokumente sind
const HAENDLER_IRRELEVANT_KEYWORDS = [
  "bewerte", "bewertung", "rezension", "review", "feedback geben",
  "wie war", "zufrieden", "erfahrung teilen",
  "gutschein", "rabatt", "coupon", "% auf", "sale", "sonderangebot", "angebot des tages",
  "empfehlung", "könnte ihnen gefallen", "ähnliche produkte", "passend dazu",
  "treuepunkte", "bonuspunkte", "prämie",
  "warenkorb", "vergessen", "abgebrochen",
  "passwort zurücksetzen", "passwort ändern", "password reset",
  "konto bestätigen", "e-mail bestätigen", "verify your email",
  "willkommen bei", "welcome to", "registrierung",
  // mahnung/zahlungserinnerung werden jetzt separat behandelt (Mahnung-Feature, nicht als Marketing blockiert)
  "inkasso", "letzte erinnerung", "forderung",
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

    // Bestellnummer aus Betreff extrahieren (wird im Response mitgesendet für STUFE 0 Match)
    const betreffOriginal = email_betreff || "";
    const nrMatch = betreffOriginal.match(/(?:bestellnummer|bestellung|order|auftrag|auftrags-?nr|bestell-?nr)[:\s#]*([A-Z0-9][\w\-]{2,29})/i)
      || betreffOriginal.match(/(\d{3}-\d{7}-\d{7})/) // Amazon-Format
      || betreffOriginal.match(/(?:nr|number|#)[.:\s]*([A-Z0-9][\w\-]{4,29})/i);
    const bestellnummerBetreff = nrMatch?.[1] || null;

    // ── 1. Kein gültiger Absender ──
    if (!absenderAdresse || !absenderAdresse.includes("@") || !absenderDomain.includes(".")) {
      return NextResponse.json({ relevant: false, grund: "kein_absender" });
    }

    // ── 2. System-Mails (Geräte, Bounces, Kalender, Telefon, Lesebestätigungen) ──
    if (SYSTEM_KEYWORDS.some(k => betreff.includes(k) || vorschau.includes(k) || absenderAdresse.includes(k))) {
      return NextResponse.json({ relevant: false, grund: "system_mail" });
    }

    // ── 2b. System-Domains (immer irrelevant) ──
    if (SYSTEM_DOMAINS.has(absenderDomain) ||
        [...SYSTEM_DOMAINS].some(d => absenderDomain.endsWith("." + d))) {
      return NextResponse.json({ relevant: false, grund: "system_domain" });
    }

    // ── 2c. Interne mrumbau.de Emails (Lesebestätigungen, Weiterleitungen etc.) ──
    if (absenderDomain === "mrumbau.de" || absenderDomain === "reuter-mr.de") {
      return NextResponse.json({ relevant: false, grund: "intern" });
    }

    // ── 2d. PayPal — IMMER irrelevant. PayPal sendet nur Zahlungsbelege, ──
    // die echte Rechnung kommt direkt vom Händler. PayPal-Belege sind keine Geschäftsdokumente.
    if (absenderDomain === "paypal.com" || absenderDomain === "paypal.de" || absenderDomain === "e.paypal.de") {
      return NextResponse.json({ relevant: false, grund: "paypal_irrelevant" });
    }

    // ── 2e. Plancraft — Subunternehmer senden Rechnungen über Plancraft ──
    if (absenderDomain === "plancraft.com" || absenderDomain === "mail.plancraft.com") {
      const plancraftDokKw = ["rechnung", "angebot", "aufmaß", "aufmass", "leistungsnachweis", "gutschrift", "invoice"];
      if (plancraftDokKw.some(k => betreff.includes(k))) {
        return NextResponse.json({ relevant: true, grund: "plancraft_dokument", bestellnummer_betreff: bestellnummerBetreff });
      }
      // Plancraft ohne Dokument-Betreff → irrelevant (System-Benachrichtigungen etc.)
      return NextResponse.json({ relevant: false, grund: "plancraft_irrelevant" });
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

    // ── 3b. Gelernte Muster aus verworfenen Bestellungen ──
    const { data: verworfene } = await supabase
      .from("verworfene_emails")
      .select("absender_adresse, absender_domain, email_betreff")
      .order("created_at", { ascending: false })
      .limit(200);

    if (verworfene && verworfene.length > 0) {
      // Exakter Absender-Match: gleicher Absender + ähnlicher Betreff → blockieren
      const exakterMatch = verworfene.find((v) => {
        if (v.absender_adresse !== absenderAdresse) return false;
        // Betreff-Ähnlichkeit: mindestens 3 gemeinsame Wörter (>3 Zeichen)
        const vWoerter = v.email_betreff.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
        const bWoerter = betreff.split(/\s+/).filter((w: string) => w.length > 3);
        const gemeinsam = vWoerter.filter((w: string) => bWoerter.includes(w));
        return gemeinsam.length >= 3 || v.email_betreff.toLowerCase() === betreff;
      });

      if (exakterMatch) {
        return NextResponse.json({ relevant: false, grund: "gelernt_verworfen" });
      }

      // Domain-Häufigkeit: gleiche Domain wurde ≥3x verworfen → blockieren
      const domainCount = verworfene.filter((v) => v.absender_domain === absenderDomain).length;
      if (domainCount >= 3) {
        return NextResponse.json({ relevant: false, grund: "domain_oft_verworfen" });
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
      // ── Mahnungs-Erkennung: bestehende Bestellung markieren statt neuen Eintrag ──
      const combined = betreff + " " + vorschau;
      const MAHNUNG_KEYWORDS = ["mahnung", "mahnschreiben", "zahlungserinnerung", "zahl.-erinnerung", "zahlungsaufforderung"];
      const istMahnung = MAHNUNG_KEYWORDS.some(k => combined.includes(k));
      if (istMahnung) {
        // Bestellnummer aus Betreff/Vorschau extrahieren für präzises Matching
        const mahnungNrMatch = combined.match(/(?:bestellnummer|bestellung|rechnung|rechnungs-?nr|bestell-?nr|auftrags-?nr|nr)[.:\s#]*([A-Z0-9][\w\-]{2,29})/i);
        try {
          let query = supabase
            .from("bestellungen")
            .select("id, bestellnummer")
            .eq("haendler_name", haendlerMatch.name)
            .is("bezahlt_am", null);

          if (mahnungNrMatch?.[1]) {
            // Präzises Match: Bestellnummer aus Mahnung
            query = query.eq("bestellnummer", mahnungNrMatch[1]);
          } else {
            // Fallback: neueste unbezahlte Bestellung dieses Händlers
            query = query.order("created_at", { ascending: false }).limit(1);
          }

          const { data: offeneBestellung } = await query.maybeSingle();
          if (offeneBestellung) {
            await supabase
              .from("bestellungen")
              .update({ mahnung_am: new Date().toISOString(), updated_at: new Date().toISOString() })
              .eq("id", offeneBestellung.id);
            console.log(`[Mahnung] Bestellung ${offeneBestellung.bestellnummer} als gemahnt markiert (Händler: ${haendlerMatch.name})`);
          }
        } catch { /* Fehler beim Mahnung-Update ignorieren */ }
        return NextResponse.json({ relevant: false, grund: "mahnung_markiert" });
      }

      // Prüfen ob es eine Marketing/Bewertungs-Mail ist (kein Geschäftsdokument)
      const istMarketing = HAENDLER_IRRELEVANT_KEYWORDS.some(k => combined.includes(k));
      if (istMarketing) {
        return NextResponse.json({ relevant: false, grund: "haendler_marketing" });
      }

      // Positive Prüfung: Betreff MUSS auf ein echtes Geschäftsdokument hindeuten
      const dokumentKeywords = [
        "bestellung", "bestätigung", "auftragsbestätigung", "order",
        "rechnung", "invoice", "gutschrift", "credit",
        "lieferschein", "lieferung", "delivery",
        "versand", "tracking", "sendung", "paket", "shipped",
        "angebot", "angebotsnr", "quotation",
        "aufmaß", "aufmass", "leistungsnachweis",
        "mahnung", "zahlungserinnerung",
      ];
      const hatDokumentHinweis = dokumentKeywords.some(k => betreff.includes(k));

      // Wenn Betreff KEIN Dokument-Keyword hat → GPT entscheiden lassen statt blind durchlassen
      if (!hatDokumentHinweis) {
        // Mini-GPT-Check für Händler-Emails ohne klaren Dokument-Betreff
        try {
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          const gptCheck = await openai.chat.completions.create({
            model: "gpt-4o",
            temperature: 0,
            max_tokens: 100,
            messages: [
              {
                role: "system",
                content: `Ist diese Email ein echtes Geschäftsdokument (Bestellung, Rechnung, Lieferschein, Angebot, Versandbestätigung)? Antworte NUR mit JSON: {"relevant": true/false, "grund": "kurz"}. Im Zweifel: false.`,
              },
              {
                role: "user",
                content: `Absender: ${email_absender}\nBetreff: ${email_betreff}\nVorschau: ${(email_vorschau || "").substring(0, 300)}`,
              },
            ],
          });
          const txt = gptCheck.choices[0]?.message?.content || "";
          const jm = txt.match(/\{[\s\S]*\}/);
          if (jm) {
            const p = JSON.parse(jm[0]);
            if (!p.relevant) {
              return NextResponse.json({ relevant: false, grund: "haendler_ki_nein", ki_begruendung: p.grund });
            }
          }
        } catch {
          // GPT-Fehler bei Händler → sicherheitshalber durchlassen
        }
      }

      return NextResponse.json({
        relevant: true,
        grund: "haendler",
        haendler_name: haendlerMatch.name,
        haendler_id: haendlerMatch.id,
        bestellnummer_betreff: bestellnummerBetreff,
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
      const combined = betreff + " " + vorschau;
      const istMarketing = HAENDLER_IRRELEVANT_KEYWORDS.some(k => combined.includes(k));
      if (istMarketing) {
        return NextResponse.json({ relevant: false, grund: "su_marketing" });
      }

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


    // ── 8. Unbekannter Absender → GPT-4o entscheidet ──
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      // Gelernte Negativ-Beispiele aus verworfenen Bestellungen
      let verworfeneBeispiele = "";
      if (verworfene && verworfene.length > 0) {
        const beispiele = verworfene
          .slice(0, 15)
          .map((v) => `- "${v.email_betreff}" von ${v.absender_adresse}`)
          .join("\n");
        verworfeneBeispiele = `\n\nFolgende Emails wurden in der Vergangenheit vom Benutzer als IRRELEVANT verworfen — ähnliche Emails sind ebenfalls irrelevant:\n${beispiele}`;
      }

      const gptResult = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0,
        max_tokens: 150,
        messages: [
          {
            role: "system",
            content: `Du bist ein strenger E-Mail-Klassifizierer für eine deutsche Baufirma (MR Umbau GmbH).
Entscheide ob diese E-Mail ein KONKRETES Geschäftsdokument enthält oder ankündigt.

RELEVANT (ja) — NUR wenn die Email SELBST ein Dokument IST oder eines im Anhang hat:
- Automatische Bestellbestätigungen direkt von einem Webshop ("Ihre Bestellung #12345")
- Rechnungen mit Rechnungsnummer und Betrag
- Lieferscheine
- Versandbestätigungen mit Tracking-Nummer
- Angebote mit konkreten Positionen/Preisen
- Aufmaße, Leistungsnachweise

IRRELEVANT (nein):
- Newsletter, Werbung, Marketing, ProfiNews, Produktinfos
- Geräte-Benachrichtigungen (Router, NAS, Drucker, Telefon/3CX)
- Bewertungsaufforderungen
- Mahnungen, Zahlungserinnerungen, Kontoinformationen
- Spam, Phishing, Bewerbungen
- Hosting-/Domain-Benachrichtigungen
- Kalender, Social Media, Lesebestätigungen
- Emails die nur "Per E-Mail senden:" im Betreff haben
- Lohnabrechnungen, Entgeltabrechnungen, Gehaltsabrechnungen, Lohnauswertungen (vom Steuerbüro/Lohnbüro)

WICHTIG — NICHT als irrelevant einstufen:
- Emails mit "Sehr geehrte Damen und Herren" oder "anbei" sind NICHT automatisch irrelevant! Viele Lieferanten und Handwerker schreiben persönliche Emails mit Rechnungen/Angeboten im Anhang.
- Wenn der Betreff ODER die Vorschau auf ein Dokument hindeutet (Rechnung, Angebot, Auftragsbestätigung, Lieferschein, im Anhang, attached) → RELEVANT.
- E-Mail-Antworten (AW:/RE:/SV:) sind NUR irrelevant wenn sie KEINE Dokumente enthalten oder ankündigen.
- Im Zweifel: RELEVANT (besser eine irrelevante Email verarbeiten als eine Rechnung verpassen).${verworfeneBeispiele}

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
