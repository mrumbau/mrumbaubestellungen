"use client";

import { useEffect } from "react";

export default function BestellungenError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // 03.06.2026 — Debug-Help nach Workspace-Migration-Crash. Server-Side-
  // Errors waren in Vercel-Logs verschüttet. Wir loggen den Error explizit
  // in die Browser-Console und zeigen Digest + Message inline an, damit man
  // auf Production sofort sehen kann was crasht.
  useEffect(() => {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.error("[bestellungen/error.tsx] crash:", {
        message: error?.message,
        digest: error?.digest,
        stack: error?.stack,
      });
    }
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="w-14 h-14 rounded-full bg-error-bg flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
      <h2 className="font-headline text-lead text-foreground mb-1">Bestellungen konnten nicht geladen werden</h2>
      <p className="text-body-sm text-foreground-subtle mb-2 max-w-md text-center">
        Beim Laden der Bestellungen ist ein Fehler aufgetreten. Bitte versuche es erneut.
      </p>
      {error?.digest && (
        <p className="text-meta text-foreground-faint mb-2 font-mono-amount">
          Fehler-Referenz: {error.digest}
        </p>
      )}
      {error?.message && (
        <details className="mb-6 max-w-md w-full">
          <summary className="text-meta text-foreground-muted cursor-pointer hover:text-foreground transition-colors">
            Technische Details
          </summary>
          <pre className="mt-2 p-3 rounded-md bg-canvas border border-line text-eyebrow text-foreground-muted overflow-auto max-h-40 whitespace-pre-wrap break-words">
            {error.message}
          </pre>
        </details>
      )}
      <button
        onClick={reset}
        className="px-5 py-2.5 text-body-sm font-medium bg-brand text-white rounded-lg hover:bg-brand-light transition-colors"
      >
        Neu laden
      </button>
    </div>
  );
}
