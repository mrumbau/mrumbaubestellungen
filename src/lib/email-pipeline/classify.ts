/**
 * Wrapper um /api/webhook/email-check.
 *
 * Wird vom Cron-Orchestrator aufgerufen, um eine Mail-Vorprüfung zu machen.
 * Identische Body-Struktur wie der Make.com-Aufruf — bestehender Endpoint
 * wird unverändert wiederverwendet (siehe ARCHITECTURE_DECISION in
 * /lib/email-pipeline/README falls später ergänzt).
 *
 * Phase-2-Idee: Die Logik aus der Route in eine reine Funktion extrahieren
 * und hier direkt importieren statt HTTP-Loopback. Heute akzeptieren wir
 * die ~50–100 ms Latenz, weil das Refactor-Risiko während Make-Parallelphase
 * zu hoch ist.
 */

import { logError } from "../logger";
import type { ClassifyEmailInput, ClassifyEmailResult } from "./types";

function getInternalBaseUrl(): string {
  // In Vercel Production: VERCEL_URL = "cloud.mrumbau.de" o.ä.
  // In Vercel Preview:    VERCEL_URL = "<deployment>.vercel.app"
  // Lokal:                NEXT_PUBLIC_APP_URL oder Fallback localhost
  const explicit = process.env.INTERNAL_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}

export async function classifyEmail(
  input: ClassifyEmailInput,
): Promise<ClassifyEmailResult> {
  const secret = process.env.MAKE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("MAKE_WEBHOOK_SECRET nicht gesetzt — classifyEmail nicht aufrufbar");
  }

  const url = `${getInternalBaseUrl()}/api/webhook/email-check`;

  // R2/F3.C1: KEIN fail-open mehr. Bei Service-Errors throw → replay.ts
  // catched → markFailed → retry-cron holt's später erneut. Verhindert
  // Cost-Bomb bei DB-Outage (vorher: alle Mails wurden via fallback durch
  // die ingest-Pipeline gejagt + OpenAI-Calls verbraucht).
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, ...input }),
  }).catch((err) => {
    logError("email-pipeline/classify", "Network-Fehler bei email-check", err);
    throw new Error(`classify_network_error: ${err instanceof Error ? err.message : "unknown"}`);
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logError("email-pipeline/classify", `email-check antwortete ${res.status}`, body.slice(0, 500));
    throw new Error(`classify_http_${res.status}`);
  }

  const json = (await res.json().catch((err) => {
    logError("email-pipeline/classify", "Invalid JSON von email-check", err);
    throw new Error("classify_invalid_response");
  })) as ClassifyEmailResult & { error?: string };

  if (json.error) {
    logError("email-pipeline/classify", "email-check meldete Fehler", json.error);
    throw new Error(`classify_error: ${json.error}`);
  }

  return json;
}
