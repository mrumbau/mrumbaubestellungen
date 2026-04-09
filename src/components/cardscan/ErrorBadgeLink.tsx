"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function ErrorBadgeLink() {
  const [errorCount, setErrorCount] = useState(0);

  useEffect(() => {
    fetch("/api/cardscan/errors")
      .then((r) => r.json())
      .then((json) => setErrorCount(json.unacknowledged_count || 0))
      .catch(() => {});
  }, []);

  return (
    <div className="flex items-center justify-between">
      <Link
        href="/cardscan/history"
        className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors py-2"
      >
        Letzte Scans →
      </Link>
      {errorCount > 0 && (
        <Link
          href="/cardscan/errors"
          className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 transition-colors py-2"
        >
          <span className="w-4.5 h-4.5 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center leading-none" style={{ width: 18, height: 18 }}>
            {errorCount}
          </span>
          Fehler
        </Link>
      )}
    </div>
  );
}
