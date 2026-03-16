// MR Umbau Bestellerkennung – Konfiguration
// Dieses Kürzel wird einmalig pro Rechner gesetzt (über Popup).
// Zur Laufzeit wird es aus chrome.storage.sync geladen.

var WEBHOOK_URL = "https://cloud.mrumbau.de/api/webhook/bestellung";
var ERKENNUNG_URL = "https://cloud.mrumbau.de/api/extension/erkennung";
var EXTENSION_SECRET = "mrumbau-ext-2026";

// =====================================================================
// STUFE 1: Bekannte Händler – sofort erkannt, kein API-Call
// =====================================================================
var HAENDLER_PATTERNS = [
  { domain: "bauhaus.de", patterns: ["/checkout/confirmation", "/bestellbestaetigung"] },
  { domain: "obi.de", patterns: ["/bestellbestaetigung", "/order-success"] },
  { domain: "amazon.de", patterns: ["/gp/buy/thankyou", "/order-confirm"] },
  { domain: "wuerth.de", patterns: ["/order/success", "/bestellung/bestaetigung"] },
  { domain: "hornbach.de", patterns: ["/order/confirmation", "/bestellbestaetigung"] },
  { domain: "hagebau.de", patterns: ["/checkout/success", "/order-confirmation"] },
  { domain: "contorion.de", patterns: ["/checkout/success", "/order/confirmation"] },
  { domain: "toolineo.de", patterns: ["/checkout/success", "/order-confirmation"] },
];

// =====================================================================
// STUFE 2: Lokaler Score – Signale die auf Bestellbestätigung hindeuten
// =====================================================================

// URL-Pfade die auf Bestellbestätigungen hindeuten (je +3 Punkte)
var SCORE_URL_PATTERNS = [
  "/order/confirmation", "/order-confirmation", "/order/success", "/order-success",
  "/order/thank", "/order/thankyou", "/order/complete", "/order/completed",
  "/checkout/confirmation", "/checkout/success", "/checkout/complete",
  "/checkout/thankyou", "/checkout/thank-you", "/checkout/done",
  "/bestellbestaetigung", "/bestellung/bestaetigung", "/bestellung/danke",
  "/purchase/confirmation", "/purchase/complete", "/purchase/thank",
  "/thankyou", "/thank-you", "/vielen-dank", "/danke",
  "/auftragsbestaetigung", "/auftrag/bestaetigung",
];

// Seitentitel-Keywords (je +2 Punkte)
var SCORE_TITLE_KEYWORDS = [
  "bestellung", "bestätigung", "bestaetigung", "auftragsbestätigung",
  "order confirm", "order complete", "order success", "order placed",
  "thank you for your order", "thanks for your order",
  "danke für ihre bestellung", "danke für deine bestellung",
  "vielen dank für ihre bestellung", "ihre bestellung wurde",
  "bestellung erfolgreich", "purchase confirmed", "purchase complete",
  "commande confirmée", "ordine confermato",
];

// DOM-Signale: CSS-Selektoren die auf Bestellbestätigungen hindeuten (je +2 Punkte)
var SCORE_DOM_SELECTORS = [
  "[class*='order-confirm']", "[class*='orderConfirm']",
  "[class*='order-success']", "[class*='orderSuccess']",
  "[class*='checkout-success']", "[class*='checkoutSuccess']",
  "[class*='thank-you']", "[class*='thankYou']",
  "[id*='order-confirm']", "[id*='orderConfirm']",
  "[data-page='order-confirmation']", "[data-page='thank-you']",
  "[data-step='confirmation']", "[data-step='complete']",
];

// Seiteninhalt-Keywords (je +1 Punkt)
var SCORE_CONTENT_KEYWORDS = [
  "bestellnummer", "order number", "ordernummer", "auftragsnummer",
  "ihre bestellung", "your order", "bestellung #",
  "versand an", "shipping to", "lieferadresse", "delivery address",
  "zahlungsart", "payment method", "bezahlung",
  "vielen dank", "thank you", "thanks for",
  "wird bearbeitet", "is being processed", "being prepared",
  "bestätigungsmail", "confirmation email", "bestätigungs-e-mail",
];

// Schwellenwerte
var SCORE_SICHER = 6;     // ≥6 Punkte → sofort Signal senden
var SCORE_VIELLEICHT = 3; // 3-5 Punkte → KI fragen
                          // <3 Punkte → ignorieren

// =====================================================================
// FILTER: Domains und Pfade die NIEMALS geprüft werden
// =====================================================================
var IGNORED_DOMAINS = [
  "google.com", "google.de", "bing.com", "yahoo.com", "duckduckgo.com",
  "youtube.com", "facebook.com", "instagram.com", "twitter.com", "x.com",
  "linkedin.com", "reddit.com", "tiktok.com", "pinterest.com",
  "wikipedia.org", "github.com", "stackoverflow.com",
  "mrumbau.de", "cloud.mrumbau.de", "supabase.co", "vercel.app",
  "localhost", "127.0.0.1",
  "web.whatsapp.com", "outlook.office.com", "mail.google.com",
  "outlook.live.com", "teams.microsoft.com", "slack.com",
  "notion.so", "figma.com", "canva.com",
  "netflix.com", "spotify.com", "twitch.tv",
];

var IGNORED_PATHS = [
  "/login", "/signin", "/signup", "/register",
  "/password", "/reset", "/verify", "/auth",
  "/settings", "/account", "/profile", "/preferences",
  "/search", "/suche", "/help", "/faq", "/contact",
  "/blog", "/news", "/about", "/impressum", "/datenschutz",
  "/privacy", "/terms", "/agb", "/cookie",
];
