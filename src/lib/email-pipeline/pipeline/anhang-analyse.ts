/**
 * R5c — Anhang-Analyse via OpenAI Vision (mit F3.F4 Document-Hash-Cache)
 *
 * Aus webhook/email/route.ts (Z. 575-596) extrahiert.
 *
 * Maximal 3 Anhänge parallel — schützt vor OpenAI-Rate-Limits und hält
 * das Lambda-Memory-Budget kontrollierbar. Cost-Tracking läuft via
 * AsyncLocalStorage (siehe `withCostTracking` in lib/openai.ts).
 *
 * F3.F4: Document-Hash-Cache. SHA-256(buffer+mime) als Schlüssel.
 * Cache-Hit überspringt OpenAI-Call komplett (~2-5s + ~$0.005 Save pro PDF).
 * 7-Tage-TTL via pg_cron `cleanup-openai-cache`.
 */

import { createHash } from "crypto";
import { analysiereDokument, type DokumentAnalyse } from "@/lib/openai";
import { createServiceClient } from "@/lib/supabase";
import { logError, logInfo } from "@/lib/logger";
import { safeBase64ToBuffer } from "./mail-utils";
import type { NormalizedAnhang } from "./anhang-handling";

export interface AnalyseErgebnis {
  analyse: DokumentAnalyse;
  dateiName: string;
  base64: string;
  mime_type: string;
}

const MAX_PARALLEL = 3;

function hashContent(buffer: Buffer, mimeType: string): string {
  return createHash("sha256").update(buffer).update("|").update(mimeType).digest("hex");
}

/**
 * F3.F4: Cache-Lookup. Bei Hit hit_count + last_hit_at update (best-effort).
 * Bei DB-Fehler fail-open (gibt null zurück → Caller macht OpenAI-Call).
 */
async function getCachedAnalyse(
  supabase: ReturnType<typeof createServiceClient>,
  contentHash: string,
): Promise<DokumentAnalyse | null> {
  try {
    const { data } = await supabase
      .from("openai_analysis_cache")
      .select("analyse_data")
      .eq("content_hash", contentHash)
      .maybeSingle();
    if (!data) return null;

    // Best-effort hit-Counter erhöhen
    void supabase
      .from("openai_analysis_cache")
      .update({ hit_count: 0, last_hit_at: new Date().toISOString() })
      .eq("content_hash", contentHash)
      .then(() => undefined);

    return data.analyse_data as DokumentAnalyse;
  } catch (err) {
    logError("anhang-analyse/cache", "Lookup-Fehler (fail-open)", err);
    return null;
  }
}

async function setCachedAnalyse(
  supabase: ReturnType<typeof createServiceClient>,
  contentHash: string,
  mimeType: string,
  analyse: DokumentAnalyse,
): Promise<void> {
  try {
    await supabase
      .from("openai_analysis_cache")
      .upsert({
        content_hash: contentHash,
        mime_type: mimeType,
        analyse_data: analyse,
        last_hit_at: new Date().toISOString(),
      }, { onConflict: "content_hash" });
  } catch (err) {
    logError("anhang-analyse/cache", "Insert-Fehler (fail-open)", err);
  }
}

/**
 * Analysiert bis zu 3 Anhänge parallel mit GPT-4o-Vision.
 * F3.F4: Document-Hash-Cache vorgeschaltet.
 * Fehlerhafte Analysen werden geloggt und übersprungen.
 */
export async function analysiereAnhaenge(
  anhaenge: NormalizedAnhang[],
  options: { folderHint?: string | null; startTime: number },
): Promise<AnalyseErgebnis[]> {
  if (anhaenge.length === 0) return [];

  const supabase = createServiceClient();
  const batch = anhaenge.slice(0, MAX_PARALLEL);

  const promises = batch.map(async (anhang) => {
    try {
      const buffer = safeBase64ToBuffer(anhang.base64);
      let analyse: DokumentAnalyse | null = null;
      let cacheHit = false;
      let contentHash: string | null = null;

      if (buffer) {
        contentHash = hashContent(buffer, anhang.mime_type);
        analyse = await getCachedAnalyse(supabase, contentHash);
        if (analyse) {
          cacheHit = true;
          logInfo("anhang-analyse/cache", "Cache-Hit", {
            datei: anhang.name,
            content_hash: contentHash.slice(0, 12),
          });
        }
      }

      if (!analyse) {
        analyse = await analysiereDokument(anhang.base64, anhang.mime_type, {
          folderHint: options.folderHint || undefined,
        });
        if (contentHash && !analyse.parse_fehler) {
          await setCachedAnalyse(supabase, contentHash, anhang.mime_type, analyse);
        }
      }

      return {
        analyse,
        dateiName: anhang.name,
        base64: anhang.base64,
        mime_type: anhang.mime_type,
        _cache_hit: cacheHit,
      };
    } catch (err) {
      logError("webhook/email/anhang-analyse", `Analyse fehlgeschlagen: ${anhang.name}`, err);
      return null;
    }
  });

  const results = await Promise.all(promises);
  const successful = results.filter((r): r is AnalyseErgebnis & { _cache_hit: boolean } => r !== null);
  const cacheHits = successful.filter((r) => r._cache_hit).length;

  logInfo("webhook/email/anhang-analyse", `${successful.length}/${batch.length} Anhänge analysiert (${cacheHits} Cache-Hits)`, {
    dauer_ms: Date.now() - options.startTime,
    cache_hits: cacheHits,
  });

  return successful.map(({ _cache_hit: _, ...rest }) => rest);
}
