// CardScan Module – Google Cloud Vision OCR Wrapper
// Verwendet DOCUMENT_TEXT_DETECTION für optimale Layout-Analyse bei Visitenkarten.
// Language-Hints: ["de", "en"] für deutsche und englische Texte.

import { logError, logInfo } from "@/lib/logger";

const ROUTE_TAG = "/lib/cardscan/google-vision";

const VISION_API_URL = "https://vision.googleapis.com/v1/images:annotate";

interface VisionOcrResult {
  text: string;
  durationMs: number;
}

/**
 * Sendet ein Base64-Bild an Google Cloud Vision DOCUMENT_TEXT_DETECTION.
 * Gibt den erkannten Volltext zurück.
 */
export async function ocrWithVision(imageBase64: string): Promise<VisionOcrResult> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;

  if (!apiKey || apiKey.trim() === "") {
    throw new Error(
      "GOOGLE_CLOUD_VISION_API_KEY ist nicht gesetzt. Bitte in .env.local eintragen."
    );
  }

  const start = Date.now();

  // Base64-Prefix entfernen falls vorhanden (data:image/jpeg;base64,...)
  const cleanBase64 = imageBase64.includes(",")
    ? imageBase64.split(",")[1]
    : imageBase64;

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
    logInfo(ROUTE_TAG, "Kein Text im Bild erkannt", { durationMs });
    return { text: "", durationMs };
  }

  logInfo(ROUTE_TAG, "OCR erfolgreich", {
    textLength: fullText.length,
    durationMs,
  });

  return { text: fullText, durationMs };
}
