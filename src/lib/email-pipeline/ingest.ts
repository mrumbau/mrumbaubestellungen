/**
 * R5c — Direct-Call statt HTTP-Loopback.
 *
 * Vorher: fetch(`${INTERNAL_APP_URL}/api/webhook/email`, ...) — fragil wegen
 * Vercel-Deployment-Protection (VERCEL_URL liefert 401-Login-Page für pg_cron-
 * Pipeline). Hotfix war INTERNAL_APP_URL=https://cloud.mrumbau.de.
 *
 * Nachher: Direkter Lib-Call zu `runEmailPipeline()`. Keine HTTP-Hop, keine
 * Auth-Kollision, keine Latenz. AsyncLocalStorage-Cost-Tracking funktioniert
 * jetzt durch die ganze Pipeline (Bucket fließt vom process-one-Lambda durch).
 */

import { logError } from "../logger";
import type { IngestEmailInput, IngestEmailResult } from "./types";
import { runEmailPipeline } from "./run";

export async function ingestEmail(input: IngestEmailInput): Promise<IngestEmailResult> {
  try {
    const result = await runEmailPipeline({
      email_betreff: input.email_betreff,
      email_absender: input.email_absender,
      email_datum: input.email_datum,
      email_text: input.email_text,
      anhaenge: input.anhaenge,
      vorfilter: input.vorfilter,
      haendler_id: input.haendler_id,
      haendler_name: input.haendler_name,
      su_id: input.su_id,
      bestellnummer_betreff: input.bestellnummer_betreff,
      document_hint: input.document_hint,
    });

    return {
      success: !!result.success,
      bestellung_id: result.bestellung_id,
      dokument_typ: result.dokument_typ,
      ki_confidence: result.ki_confidence,
      parser_source: result.parser_source,
      parser_name: result.parser_name ?? null,
      skipped: result.skipped,
      reason: result.reason,
      debug_anhaenge: result.debug_anhaenge,
    };
  } catch (err) {
    logError("email-pipeline/ingest", "Direct-Call zu runEmailPipeline fehlgeschlagen", err);
    return {
      success: false,
      fehler: err instanceof Error ? err.message : "unbekannter_fehler",
    };
  }
}
