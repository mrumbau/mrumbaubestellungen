// MR Umbau Bestellerkennung – Konfiguration
// Dieses Kürzel wird einmalig pro Rechner gesetzt (über Popup).
// Zur Laufzeit wird es aus chrome.storage.sync geladen.

const WEBHOOK_URL = "https://cloud.mrumbau.de/api/webhook/bestellung";
const EXTENSION_SECRET = "mrumbau-ext-2026";

// Bekannte Händler mit URL-Erkennungsmustern für Checkout-Bestätigungsseiten
const HAENDLER_PATTERNS = [
  {
    domain: "bauhaus.de",
    patterns: ["/checkout/confirmation", "/bestellbestaetigung"],
  },
  {
    domain: "obi.de",
    patterns: ["/bestellbestaetigung", "/order-success"],
  },
  {
    domain: "amazon.de",
    patterns: ["/gp/buy/thankyou", "/order-confirm"],
  },
  {
    domain: "wuerth.de",
    patterns: ["/order/success", "/bestellung/bestaetigung"],
  },
];
