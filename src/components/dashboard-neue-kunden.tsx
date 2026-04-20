"use client";

import { useState } from "react";
import Link from "next/link";

interface NeuerKunde {
  id: string;
  name: string;
  keywords: string[] | null;
  created_at: string;
}

export function DashboardNeueKunden({
  kunden,
}: {
  kunden: NeuerKunde[];
}) {
  const [items, setItems] = useState(kunden);
  const [loading, setLoading] = useState<string | null>(null);

  if (items.length === 0) return null;

  async function bestaetigen(kundeId: string) {
    setLoading(kundeId);
    try {
      const res = await fetch(`/api/kunden/${kundeId}/bestaetigen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        setItems((prev) => prev.filter((k) => k.id !== kundeId));
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="card p-5 border-l-[3px] border-l-info">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 className="font-headline text-sm text-foreground tracking-tight">Neue Kunden erkannt</h2>
          <span className="font-mono-amount text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
            {items.length}
          </span>
        </div>
      </div>

      <p className="text-xs text-foreground-subtle mb-3">
        Diese Kunden wurden automatisch aus Dokumenten erkannt. Bitte prüfen und bestätigen.
      </p>

      <div className="space-y-2">
        {items.map((k) => (
          <div key={k.id} className="bg-blue-50/50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {k.name}
                </p>
                {k.keywords && k.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {k.keywords.map((kw, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 ml-3 flex-shrink-0">
                <button
                  onClick={() => bestaetigen(k.id)}
                  disabled={loading === k.id}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 rounded-lg hover:bg-emerald-200 disabled:opacity-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  OK
                </button>
                <Link
                  href="/kunden"
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
