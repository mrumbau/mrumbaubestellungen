"use client";

import { useState } from "react";
import Link from "next/link";

interface NeuerHaendler {
  id: string;
  name: string;
  domain: string;
  email_absender: string[];
  created_at: string;
}

export function DashboardNeueHaendler({
  haendler,
}: {
  haendler: NeuerHaendler[];
}) {
  const [items, setItems] = useState(haendler);
  const [loading, setLoading] = useState<string | null>(null);

  if (items.length === 0) return null;

  async function bestaetigen(haendlerId: string) {
    setLoading(haendlerId);
    try {
      const res = await fetch("/api/haendler/bestaetigen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ haendler_id: haendlerId }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((h) => h.id !== haendlerId));
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="card p-5 border-l-[3px] border-l-warning">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h2 className="font-headline text-sm text-foreground tracking-tight">Neue Händler erkannt</h2>
          <span className="font-mono-amount text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
            {items.length}
          </span>
        </div>
      </div>

      <p className="text-xs text-foreground-subtle mb-3">
        Diese Händler wurden automatisch erkannt – bitte prüfen und bestätigen.
      </p>

      <div className="space-y-2">
        {items.map((h) => (
          <div key={h.id} className="bg-amber-50/50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {h.name}
                </p>
                <p className="text-[11px] text-foreground-faint truncate">
                  {h.domain}
                  {h.email_absender?.length > 0 && (
                    <> · {h.email_absender.join(", ")}</>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-1.5 ml-3 flex-shrink-0">
                <button
                  onClick={() => bestaetigen(h.id)}
                  disabled={loading === h.id}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 rounded-lg hover:bg-emerald-200 disabled:opacity-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  OK
                </button>
                <Link
                  href="/einstellungen"
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-foreground-subtle bg-line-subtle rounded-lg hover:bg-line transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Bearbeiten
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
