import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// GET /api/extension/config – Liefert dynamische Konfiguration für die Extension
// Enthält Händler-Patterns, Score-Keywords und Schwellenwerte
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-extension-secret");
  if (secret !== process.env.EXTENSION_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Händler mit URL-Mustern laden
  const { data: haendler } = await supabase
    .from("haendler")
    .select("domain, url_muster")
    .not("url_muster", "eq", "{}");

  const haendlerPatterns = (haendler || [])
    .filter((h) => h.url_muster && h.url_muster.length > 0)
    .map((h) => ({
      domain: h.domain,
      patterns: h.url_muster,
    }));

  // Dynamische Config – kann später über Admin-Einstellungen erweiterbar sein
  const config = {
    haendler: haendlerPatterns,

    score_url_patterns: [
      "/order/confirmation", "/order-confirmation", "/order/success", "/order-success",
      "/order/thank", "/order/thankyou", "/order/complete", "/order/completed",
      "/checkout/confirmation", "/checkout/success", "/checkout/complete",
      "/checkout/thankyou", "/checkout/thank-you", "/checkout/done",
      "/bestellbestaetigung", "/bestellung/bestaetigung", "/bestellung/danke",
      "/purchase/confirmation", "/purchase/complete", "/purchase/thank",
      "/thankyou", "/thank-you", "/vielen-dank", "/danke",
      "/auftragsbestaetigung", "/auftrag/bestaetigung",
    ],

    score_title_keywords: [
      "bestellung", "bestätigung", "bestaetigung", "auftragsbestätigung",
      "order confirm", "order complete", "order success", "order placed",
      "thank you for your order", "thanks for your order",
      "danke für ihre bestellung", "danke für deine bestellung",
      "vielen dank für ihre bestellung", "ihre bestellung wurde",
      "bestellung erfolgreich", "purchase confirmed", "purchase complete",
      "commande confirmée", "ordine confermato",
    ],

    score_dom_selectors: [
      "[class*='order-confirm']", "[class*='orderConfirm']",
      "[class*='order-success']", "[class*='orderSuccess']",
      "[class*='checkout-success']", "[class*='checkoutSuccess']",
      "[class*='thank-you']", "[class*='thankYou']",
      "[id*='order-confirm']", "[id*='orderConfirm']",
      "[data-page='order-confirmation']", "[data-page='thank-you']",
      "[data-step='confirmation']", "[data-step='complete']",
    ],

    score_content_keywords: [
      "bestellnummer", "order number", "ordernummer", "auftragsnummer",
      "ihre bestellung", "your order", "bestellung #",
      "versand an", "shipping to", "lieferadresse", "delivery address",
      "zahlungsart", "payment method", "bezahlung",
      "vielen dank", "thank you", "thanks for",
      "wird bearbeitet", "is being processed", "being prepared",
      "bestätigungsmail", "confirmation email", "bestätigungs-e-mail",
    ],

    score_sicher: 6,
    score_vielleicht: 3,

    ignored_domains: [
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
    ],

    ignored_paths: [
      "/login", "/signin", "/signup", "/register",
      "/password", "/reset", "/verify", "/auth",
      "/settings", "/account", "/profile", "/preferences",
      "/search", "/suche", "/help", "/faq", "/contact",
      "/blog", "/news", "/about", "/impressum", "/datenschutz",
      "/privacy", "/terms", "/agb", "/cookie",
    ],

    updated_at: new Date().toISOString(),
  };

  return NextResponse.json(config, {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}
