"use client";

import { useState } from "react";
import Link from "next/link";

interface NeuerSubunternehmer {
  id: string;
  firma: string;
  gewerk: string | null;
  email_absender: string[];
}

export function DashboardNeueSubunternehmer({
  subunternehmer,
}: {
  subunternehmer: NeuerSubunternehmer[];
}) {
  const [items, setItems] = useState(subunternehmer);
  const [loading, setLoading] = useState<string | null>(null);

  if (items.length === 0) return null;

  async function bestaetigen(subunternehmerId: string) {
    setLoading(subunternehmerId);
    try {
      const res = await fetch("/api/subunternehmer/bestaetigen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subunternehmer_id: subunternehmerId }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((s) => s.id !== subunternehmerId));
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-canvas flex items-center justify-center">
            <svg className="w-4 h-4 text-foreground-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
          </div>
          <h3 className="font-headline text-sm text-foreground tracking-tight">Neue Subunternehmer erkannt</h3>
        </div>
      </div>

      <p className="text-xs text-foreground-subtle mb-3">
        Diese Subunternehmer wurden automatisch erkannt – bitte prüfen und bestätigen.
      </p>

      <div className="space-y-2">
        {items.map((s) => (
          <div key={s.id} className="bg-canvas rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {s.firma}
                </p>
                <p className="text-[11px] text-foreground-faint truncate">
                  {s.gewerk && <>{s.gewerk} · </>}
                  {s.email_absender?.length > 0 && (
                    <>{s.email_absender.join(", ")}</>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-1.5 ml-3 flex-shrink-0">
                <button
                  onClick={() => bestaetigen(s.id)}
                  disabled={loading === s.id}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-success bg-success-bg border border-success-border rounded-lg hover:opacity-80 disabled:opacity-50 transition-colors"
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
