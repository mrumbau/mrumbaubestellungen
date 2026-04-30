/**
 * Sentry Server-Side Init.
 * Lädt nur wenn SENTRY_DSN gesetzt ist — bei nicht-Sentry-Setup ein No-Op.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    // Tracing 10% — sample für Performance-Monitoring
    tracesSampleRate: 0.1,
    // PII redaction
    sendDefaultPii: false,
    // Filter out noise
    ignoreErrors: [
      // Network/timeouts werden retried — kein Sentry-Issue
      "ECONNRESET",
      "ETIMEDOUT",
      "ECONNREFUSED",
      // Vercel-internal
      "ResponseAborted",
    ],
  });
}
