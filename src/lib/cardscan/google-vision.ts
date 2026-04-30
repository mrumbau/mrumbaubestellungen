// CardScan Module – Google Cloud Vision OCR Wrapper
// Verwendet DOCUMENT_TEXT_DETECTION für optimale Layout-Analyse bei Visitenkarten.
// Language-Hints: ["de", "en"] für deutsche und englische Texte.

import { logError, logInfo } from "@/lib/logger";
import { CARDSCAN_VISION_MAX_IMAGE_BYTES } from "./constants";

const ROUTE_TAG = "/lib/cardscan/google-vision";

const VISION_API_URL = "https://vision.googleapis.com/v1/images:annotate";

// R2/F7.2: Cost-Diagnose. Vision DOCUMENT_TEXT_DETECTION ~$1.50/1000 Calls.
// Loggen wir pro Call zur Sichtbarkeit. Für aggregierte Caps siehe
// die separate Daily-Cap-Logik (R2.6).
const VISION_COST_USD_PER_CALL = 0.0015;
const USD_TO_EUR = 0.93;

interface VisionOcrResult {
  text: string;
  durationMs: number;
  /** F7.2: Costs in EUR pro Call zum Persistieren in cardscan_captures.vision_cost_eur. */
  costEur: number;
}

/**
 * Sendet ein Base64-Bild an Google Cloud Vision DOCUMENT_TEXT_DETECTION.
 * Gibt den erkannten Volltext zurück.
 *
 * R2/F7.16: Pre-Call Size-Check. Bilder über CARDSCAN_VISION_MAX_IMAGE_BYTES
 * werden abgelehnt — verhindert kostspielige OCR auf unkomprimierten XL-Fotos.
 */
export async function ocrWithVision(imageBase64: string): Promise<VisionOcrResult> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;

  if (!apiKey || apiKey.trim() === "") {
    throw new Error(
      "GOOGLE_CLOUD_VISION_API_KEY ist nicht gesetzt. Bitte in .env.local eintragen."
    );
  }

  // Base64-Prefix entfernen falls vorhanden (data:image/jpeg;base64,...)
  const cleanBase64 = imageBase64.includes(",")
    ? imageBase64.split(",")[1]
    : imageBase64;

  // Size-Check: Base64-Länge × 0.75 ≈ Originalbytes
  const estimatedBytes = Math.ceil((cleanBase64.length * 3) / 4);
  if (estimatedBytes > CARDSCAN_VISION_MAX_IMAGE_BYTES) {
    logError(ROUTE_TAG, "Bild zu groß für Vision-OCR", {
      estimatedKb: Math.round(estimatedBytes / 1024),
      maxKb: Math.round(CARDSCAN_VISION_MAX_IMAGE_BYTES / 1024),
    });
    throw new Error(
      `Bild zu groß für OCR (${Math.round(estimatedBytes / 1024)} KB). Maximum: ${Math.round(CARDSCAN_VISION_MAX_IMAGE_BYTES / 1024 / 1024 * 10) / 10} MB. Bitte vor dem Upload komprimieren.`
    );
  }

  const start = Date.now();

  const requestBody = {
    requests: [
      {
        image: {
          content: cleanBase64,
        },
        features: [
          {
            type: "DOCUMENT_TEXT_DETECTION",
            maxResults: 1,
          },
        ],
        imageContext: {
          languageHints: ["de", "en"],
        },
      },
    ],
  };

  const res = await fetch(`${VISION_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    logError(ROUTE_TAG, `Vision API HTTP ${res.status}`, { errorText: errorText.slice(0, 500) });
    throw new Error(`Google Vision API Fehler: HTTP ${res.status}`);
  }

  const json = await res.json();
  const durationMs = Date.now() - start;
  const costEur = VISION_COST_USD_PER_CALL * USD_TO_EUR;

  // Fehler in der Response prüfen
  const responseItem = json.responses?.[0];
  if (responseItem?.error) {
    const errMsg = responseItem.error.message || "Unbekannter Vision-Fehler";
    logError(ROUTE_TAG, "Vision API Error Response", responseItem.error);
    throw new Error(`Google Vision: ${errMsg}`);
  }

  // fullTextAnnotation hat die beste Struktur (inkl. Layout)
  const fullText =
    responseItem?.fullTextAnnotation?.text ||
    responseItem?.textAnnotations?.[0]?.description ||
    "";

  if (!fullText) {
    logInfo(ROUTE_TAG, "Kein Text im Bild erkannt", { durationMs, cost_eur: Number(costEur.toFixed(6)) });
    return { text: "", durationMs, costEur };
  }

  logInfo(ROUTE_TAG, "OCR erfolgreich", {
    textLength: fullText.length,
    durationMs,
    image_kb: Math.round(estimatedBytes / 1024),
    cost_eur: Number(costEur.toFixed(6)),
  });

  return { text: fullText, durationMs, costEur };
}
