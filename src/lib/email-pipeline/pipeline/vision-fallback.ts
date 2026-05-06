/**
 * Vision-OCR-Fallback für Email-Pipeline (06.05.2026).
 *
 * Wenn GPT-4o-Vision bei einem Bild-Anhang `typ='rechnung'` erkennt aber
 * `gesamtbetrag=null` liefert, ist das oft ein Layout-Problem (Tabellen-
 * Erkennung schwach). Google-Cloud-Vision OCR hat bei Bildern eine deutlich
 * bessere Text-Extraktion. Wir lassen Google-Vision den Text extrahieren
 * und schicken den Volltext nochmal als text/plain durch die KI.
 *
 * Bei PDFs greift dieser Fallback NICHT — GPT-4o-File-API liest PDFs
 * direkt mit Vision-Capability ein. Wenn das versagt, ist eher das PDF
 * bildlich (Scan ohne Textebene) und die KI versucht's erneut mit
 * gpt-4o als Fallback (siehe analysiereDokument).
 *
 * Kosten-Cap: 50 Calls/Tag (~$0.07/Tag absolut max).
 */

import { ocrWithVision } from "@/lib/cardscan/google-vision";
import { analysiereDokument, type DokumentAnalyse } from "@/lib/openai";
import { createServiceClient } from "@/lib/supabase";
import { logError, logInfo } from "@/lib/logger";

const ROUTE = "email-pipeline/vision-fallback";
const DAILY_VISION_CAP_EMAIL = 50;

/**
 * Prüft die Tagesquota für Email-Pipeline-Vision-Calls.
 * Persistiert via webhook_logs typ='vision_fallback' (existing Tabelle).
 */
async function checkDailyQuota(): Promise<boolean> {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const supabase = createServiceClient();
    const { count } = await supabase
      .from("webhook_logs")
      .select("*", { count: "exact", head: true })
      .eq("typ", "vision_fallback")
      .eq("status", "success")
      .gte("created_at", today.toISOString());
    return (count ?? 0) < DAILY_VISION_CAP_EMAIL;
  } catch (err) {
    logError(ROUTE, "Quota-Check fail-open", err);
    return true;
  }
}

async function logVisionCall(success: boolean, info: string): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase.from("webhook_logs").insert({
      typ: "vision_fallback",
      status: success ? "success" : "error",
      fehler_text: info,
    });
  } catch {
    // Fail-silent: Logging-Fehler darf Pipeline nicht blockieren
  }
}

/**
 * Versucht via Google-Vision-OCR + KI-Re-Analyse einen besseren `gesamtbetrag`
 * zu extrahieren, wenn die ursprüngliche KI-Analyse einen Bild-Anhang als
 * "rechnung" mit null-Betrag erkannt hat.
 *
 * Returns:
 *  - bessere Analyse wenn Vision-Pfad einen Betrag liefert
 *  - originale Analyse wenn Vision nichts findet oder fail
 *  - originale Analyse wenn Quota erreicht
 */
export async function maybeVisionFallback(
  originalAnalyse: DokumentAnalyse,
  imageBase64: string,
  mimeType: string,
  folderHint: string | null,
): Promise<DokumentAnalyse> {
  // Nur triggern bei: Bild + rechnung-Typ + null-Betrag
  if (!mimeType.startsWith("image/")) return originalAnalyse;
  if (originalAnalyse.typ !== "rechnung" && originalAnalyse.typ !== "bestellbestaetigung") {
    return originalAnalyse;
  }
  if (originalAnalyse.gesamtbetrag != null) return originalAnalyse;

  // Quota
  const allowed = await checkDailyQuota();
  if (!allowed) {
    logInfo(ROUTE, "Daily-Cap erreicht — Vision-Fallback übersprungen");
    return originalAnalyse;
  }

  try {
    const vision = await ocrWithVision(imageBase64);
    if (!vision.text || vision.text.length < 50) {
      await logVisionCall(false, "Vision lieferte keinen brauchbaren Text");
      return originalAnalyse;
    }

    // OCR-Text erneut durch KI als text/plain
    const textBase64 = Buffer.from(vision.text.slice(0, 15000)).toString("base64");
    const visionAnalyse = await analysiereDokument(textBase64, "text/plain", {
      folderHint: folderHint || undefined,
    });

    if (visionAnalyse && visionAnalyse.gesamtbetrag != null) {
      logInfo(ROUTE, "Vision-Fallback erfolgreich — Betrag wiederhergestellt", {
        original_typ: originalAnalyse.typ,
        vision_betrag: visionAnalyse.gesamtbetrag,
        ocr_text_len: vision.text.length,
      });
      await logVisionCall(true, `Vision-Fallback: typ=${visionAnalyse.typ} brutto=${visionAnalyse.gesamtbetrag}`);
      return visionAnalyse;
    }

    await logVisionCall(false, "Vision-Fallback fand auch keinen Betrag");
    return originalAnalyse;
  } catch (err) {
    logError(ROUTE, "Vision-Fallback-Exception (fail-open)", err);
    await logVisionCall(false, err instanceof Error ? err.message : "unknown_error");
    return originalAnalyse;
  }
}
