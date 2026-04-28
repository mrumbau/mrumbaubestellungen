/**
 * Wrapper um /api/webhook/email.
 *
 * Wird vom Cron-Orchestrator aufgerufen, nachdem classify() relevant=true
 * geliefert hat. Identische Body-Struktur wie der Make.com-Aufruf:
 *   { secret, email_absender, email_betreff, email_datum, email_text,
 *     email_vorschau?, vorfilter?, haendler_id?, haendler_name?, su_id?,
 *     bestellnummer_betreff?, anhaenge?: [{name, contentType, contentBytes}] }
 *
 * Timeout: 180s (entspricht Make-Konfiguration).
 */

import { logError } from "../logger";
import type { IngestEmailInput, IngestEmailResult } from "./types";

function getInternalBaseUrl(): string {
  const explicit = process.env.INTERNAL_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

const INGEST_TIMEOUT_MS = 180_000;

export async function ingestEmail(input: IngestEmailInput): Promise<IngestEmailResult> {
  const secret = process.env.MAKE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("MAKE_WEBHOOK_SECRET nicht gesetzt — ingestEmail nicht aufrufbar");
  }

  const url = `${getInternalBaseUrl()}/api/webhook/email`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INGEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, ...input }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`email-ingest antwortete ${res.status}: ${text.slice(0, 500)}`);
    }

    const json = (await res.json()) as Record<string, unknown>;
    return {
      success: !!json.success || res.ok,
      bestellung_id: typeof json.bestellung_id === "string" ? json.bestellung_id : undefined,
      dokument_typ: typeof json.dokument_typ === "string" ? json.dokument_typ : undefined,
      ki_confidence:
        typeof json.ki_confidence === "number" ? json.ki_confidence : undefined,
      fehler: typeof json.error === "string" ? json.error : undefined,
    };
  } catch (err) {
    logError("email-pipeline/ingest", "Fehler beim Aufruf von /api/webhook/email", err);
    return {
      success: false,
      fehler: err instanceof Error ? err.message : "unbekannter_fehler",
    };
  } finally {
    clearTimeout(timeout);
  }
}
