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

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, ...input }),
    });

    if (!res.ok) {
      throw new Error(`email-check antwortete ${res.status}`);
    }

    const json = (await res.json()) as ClassifyEmailResult & { error?: string };
    if (json.error) {
      throw new Error(`email-check Fehler: ${json.error}`);
    }
    return json;
  } catch (err) {
    logError("email-pipeline/classify", "Fehler beim Aufruf von /api/webhook/email-check", err);
    // Sicherheits-Fallback: bei Fehler durchlassen — wie der bestehende Endpoint
    // selbst es bei internen Fehlern macht (Zeile 467 in route.ts).
    return { relevant: true, grund: "classify_fehler_fallback" };
  }
}
