"use client";

import { useState } from "react";

interface KIZusammenfassung {
  zusammenfassung: string;
  dringend: string[];
  highlights: string[];
}

export function DashboardKIZusammenfassung() {
  const [data, setData] = useState<KIZusammenfassung | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function laden() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ki/zusammenfassung");
      if (!res.ok) throw new Error("Fehler beim Laden");
      const json = await res.json();
      setData(json);
    } catch {
      setError("KI-Zusammenfassung konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  if (!data && !loading && !error) {
    return (
      <div className="mb-6">
        <button
          onClick={laden}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-brand text-white rounded-lg hover:bg-brand-light transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
          KI-Zusammenfassung generieren
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mb-6 card p-5">
        <div className="flex items-center gap-3">
          <div className="spinner w-5 h-5" />
          <span className="text-sm text-foreground-subtle">KI analysiert aktuelle Daten...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-6 bg-error-bg rounded-xl border border-error-border p-4">
        <p className="text-sm text-error">{error}</p>
        <button onClick={laden} className="mt-2 text-xs text-error underline">
          Erneut versuchen
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mb-6 card p-5 border-l-[3px] border-l-brand">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
          <h3 className="font-headline text-sm text-foreground tracking-tight">KI-Zusammenfassung</h3>
        </div>
        <button
          onClick={laden}
          className="text-xs text-brand hover:text-brand-light font-medium transition-colors"
        >
          Aktualisieren
        </button>
      </div>

      <p className="text-sm text-foreground-muted leading-relaxed mb-3">{data.zusammenfassung}</p>

      {data.dringend.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold text-error tracking-widest uppercase mb-1">Dringend:</p>
          <ul className="space-y-1">
            {data.dringend.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-error">
                <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-error shrink-0" />
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.highlights.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-success tracking-widest uppercase mb-1">Highlights:</p>
          <ul className="space-y-1">
            {data.highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-success">
                <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
