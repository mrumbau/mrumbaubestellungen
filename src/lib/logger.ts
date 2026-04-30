/**
 * Strukturiertes Logging für API-Routen.
 * Schreibt JSON-Logs mit Timestamp, Route, Request-ID und Fehlerdetails.
 *
 * F3.F16: Request-ID via AsyncLocalStorage (Server-only). Wenn ein Handler
 * `withRequestId()` wraped, fließt die ID durch alle nested logInfo/logError-
 * Calls — Logs einer Pipeline-Run sind via die ID korrelierbar.
 *
 * Hinweis: AsyncLocalStorage ist Node.js-only. Auf Client-Bundle wird
 * withRequestId/getRequestId zu einem No-Op (logger ist auch client-importable
 * via type-shared Modules wie bestellung-utils.ts).
 */

const isServer = typeof window === "undefined";

// Lazy-init: AsyncLocalStorage nur im Server-Bundle
type Store = { getStore(): string | undefined; run<T>(value: string, fn: () => T): T };
let requestIdStore: Store | null = null;

if (isServer) {
  try {
    // dynamische Auflösung verhindert Client-Bundle-Inclusion
    const moduleName = "node:async_hooks";
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AsyncLocalStorage } = require(moduleName) as typeof import("node:async_hooks");
    requestIdStore = new AsyncLocalStorage<string>();
  } catch {
    requestIdStore = null;
  }
}

function makeId(): string {
  if (isServer) {
    try {
      const moduleName = "node:crypto";
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { randomUUID } = require(moduleName) as typeof import("node:crypto");
      return randomUUID();
    } catch {
      // fall through
    }
  }
  // Fallback (Browser-Bundles oder ohne node:crypto)
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Wrappt einen Block in einen Request-ID-Kontext. Alle logInfo/logError-Calls
 * darin geben die ID als `request_id`-Feld mit aus. No-Op im Client-Bundle.
 */
export function withRequestId<T>(fn: () => Promise<T>, id?: string): Promise<T> {
  const rid = id ?? makeId();
  if (!requestIdStore) return fn();
  return requestIdStore.run(rid, fn);
}

/** Liefert die aktuelle Request-ID oder null wenn außerhalb withRequestId. */
export function getRequestId(): string | null {
  if (!requestIdStore) return null;
  return requestIdStore.getStore() ?? null;
}

export function logError(route: string, message: string, error?: unknown) {
  const requestId = getRequestId();
  const entry = {
    level: "error",
    timestamp: new Date().toISOString(),
    route,
    message,
    ...(requestId ? { request_id: requestId } : {}),
    ...(error instanceof Error
      ? { error: error.message, stack: error.stack }
      : error != null
        ? { error: String(error) }
        : {}),
  };
  console.error(JSON.stringify(entry));

  // Sentry-Forwarding (No-Op wenn SENTRY_DSN nicht gesetzt). Async-Import damit
  // Client-Bundles nicht @sentry/nextjs in der Tree haben wenn sie es nicht brauchen.
  if (isServer && process.env.SENTRY_DSN) {
    void (async () => {
      try {
        const Sentry = await import("@sentry/nextjs");
        Sentry.captureException(error instanceof Error ? error : new Error(message), {
          tags: { route, ...(requestId ? { request_id: requestId } : {}) },
          extra: { message },
        });
      } catch {
        // Sentry-Forward darf logger nicht crashen
      }
    })();
  }
}

export function logInfo(route: string, message: string, data?: Record<string, unknown>) {
  const requestId = getRequestId();
  const entry = {
    level: "info",
    timestamp: new Date().toISOString(),
    route,
    message,
    ...(requestId ? { request_id: requestId } : {}),
    ...data,
  };
  console.log(JSON.stringify(entry));
}
