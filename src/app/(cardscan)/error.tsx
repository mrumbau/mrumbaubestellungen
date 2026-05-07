"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function CardScanError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("CardScan-Render-Fehler:", error);
  }, [error]);

  return (
    <div className="max-w-lg md:max-w-xl mx-auto py-12 text-center animate-fade-in">
      <div className="w-14 h-14 mx-auto mb-5 rounded-2xl flex items-center justify-center bg-error-bg">
        <svg className="w-7 h-7 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>

      <h1 className="font-headline text-xl text-foreground tracking-tight mb-1">
        Etwas ist schiefgelaufen
      </h1>
      <p className="text-sm text-foreground-muted mb-6">
        CardScan konnte diese Ansicht nicht laden.
        {error.digest && (
          <span className="block mt-1 font-mono-amount text-[10px] text-foreground-subtle">
            Code: {error.digest}
          </span>
        )}
      </p>

      <div className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
        <button
          type="button"
          onClick={reset}
          className="flex-1 py-3.5 px-4 rounded-xl bg-cs-accent text-white text-sm font-medium hover:bg-cs-accent-light transition-colors min-h-[48px] active:scale-[0.98]"
        >
          Erneut versuchen
        </button>
        <Link
          href="/cardscan"
          className="flex-1 py-3.5 px-4 rounded-xl border border-line text-foreground-muted text-sm font-medium hover:bg-input transition-colors min-h-[48px] inline-flex items-center justify-center"
        >
          Zur Übersicht
        </Link>
      </div>
    </div>
  );
}
