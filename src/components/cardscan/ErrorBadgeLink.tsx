"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function ErrorBadgeLink({ isAdmin = false }: { isAdmin?: boolean }) {
  const [errorCount, setErrorCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/cardscan/errors")
      .then((r) => r.json())
      .then((json) => setErrorCount(json.unacknowledged_count || 0))
      .catch(() => {});
  }, [isAdmin]);

  return (
    <div className="flex items-center justify-between">
      <Link
        href="/cardscan/history"
        className="text-xs text-foreground-subtle hover:text-foreground-muted transition-colors py-2"
      >
        Letzte Scans →
      </Link>
      {isAdmin && errorCount > 0 && (
        <Link
          href="/cardscan/errors"
          className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 transition-colors py-2"
        >
          <span className="rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center leading-none" style={{ width: 18, height: 18 }}>
            {errorCount}
          </span>
          Fehler
        </Link>
      )}
    </div>
  );
}
