/**
 * R5c — Anhang-Analyse via OpenAI Vision
 *
 * Aus webhook/email/route.ts (Z. 575-596) extrahiert.
 *
 * Maximal 3 Anhänge parallel — schützt vor OpenAI-Rate-Limits und hält
 * das Lambda-Memory-Budget kontrollierbar. Cost-Tracking läuft via
 * AsyncLocalStorage (siehe `withCostTracking` in lib/openai.ts).
 */

import { analysiereDokument, type DokumentAnalyse } from "@/lib/openai";
import { logError, logInfo } from "@/lib/logger";
import type { NormalizedAnhang } from "./anhang-handling";

export interface AnalyseErgebnis {
  analyse: DokumentAnalyse;
  dateiName: string;
  base64: string;
  mime_type: string;
}

const MAX_PARALLEL = 3;

/**
 * Analysiert bis zu 3 Anhänge parallel mit GPT-4o-Vision.
 * Fehlerhafte Analysen werden geloggt und übersprungen — die Pipeline
 * läuft mit den erfolgreichen Ergebnissen weiter.
 */
export async function analysiereAnhaenge(
  anhaenge: NormalizedAnhang[],
  options: { folderHint?: string | null; startTime: number },
): Promise<AnalyseErgebnis[]> {
  if (anhaenge.length === 0) return [];

  const batch = anhaenge.slice(0, MAX_PARALLEL);
  const promises = batch.map(async (anhang) => {
    try {
      const analyse = await analysiereDokument(anhang.base64, anhang.mime_type, {
        folderHint: options.folderHint || undefined,
      });
      return {
        analyse,
        dateiName: anhang.name,
        base64: anhang.base64,
        mime_type: anhang.mime_type,
      };
    } catch (err) {
      logError("webhook/email/anhang-analyse", `Analyse fehlgeschlagen: ${anhang.name}`, err);
      return null;
    }
  });

  const results = await Promise.all(promises);
  const successful = results.filter((r): r is AnalyseErgebnis => r !== null);

  logInfo("webhook/email/anhang-analyse", `${successful.length}/${batch.length} Anhänge analysiert`, {
    dauer_ms: Date.now() - options.startTime,
  });

  return successful;
}
