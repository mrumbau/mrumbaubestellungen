"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function ErrorBadgeLink() {
  const [errorCount, setErrorCount] = useState(0);

  useEffect(() => {
    fetch("/api/cardscan/errors")
      .then((r) => r.json())
      .then((json) => {
        setErrorCount(json.unacknowledged_count || 0);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="mt-8 flex items-center justify-center gap-4">
      <Link
        href="/cardscan/history"
        className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
      >
        Letzte Scans ansehen →
      </Link>
      {errorCount > 0 && (
        <Link
          href="/cardscan/errors"
          className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 transition-colors"
        >
          <span className="w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
            {errorCount}
          </span>
          Fehler
        </Link>
      )}
    </div>
  );
}
