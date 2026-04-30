"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/cn";
import type { TimeRange } from "@/components/ui/time-range-picker";

interface KIZusammenfassung {
  zusammenfassung: string;
  dringend: string[];
  highlights: string[];
  /** Für welchen Range wurde diese Zusammenfassung generiert? Wichtig damit Client
      einen Range-Mismatch erkennen kann (Cache war für anderen Zeitraum). */
  range?: TimeRange;
  rangeLabel?: string;
}

function relativeZeit(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const t = Math.floor(h / 24);
  if (t === 1) return "gestern";
  if (t < 7) return `vor ${t} Tagen`;
  const w = Math.floor(t / 7);
  if (w === 1) return "vor 1 Woche";
  return `vor ${w} Wochen`;
}

function istStale(iso: string): boolean {
  // Älter als 1 Stunde → subtile Farb-Akzentuierung, um den User an Refresh zu erinnern
  return Date.now() - new Date(iso).getTime() > 60 * 60 * 1000;
}

export function DashboardKIZusammenfassung({
  initial = null,
  initialGeneratedAt = null,
  currentRange = "30d",
}: {
  initial?: KIZusammenfassung | null;
  initialGeneratedAt?: string | null;
  /** Aktuell gewählter Zeitraum — Cache wird nur angezeigt, wenn er dazu passt */
  currentRange?: TimeRange;
}) {
  // Cache nur verwenden wenn er für den aktuell gewählten Range generiert wurde.
  // Sonst zeigt der User Daten, die nicht zum Picker passen — verwirrend.
  const cacheFitsRange = initial?.range === currentRange;
  const [data, setData] = useState<KIZusammenfassung | null>(cacheFitsRange ? initial : null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(cacheFitsRange ? initialGeneratedAt : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slowWarning, setSlowWarning] = useState(false);

  // F4.2 — Wenn KI-Anfrage länger als 10s läuft, User-Hinweis statt Stille
  useEffect(() => {
    if (!loading) {
      setSlowWarning(false);
      return;
    }
    const t = setTimeout(() => setSlowWarning(true), 10_000);
    return () => clearTimeout(t);
  }, [loading]);

  // Wenn der Range wechselt (URL-Navigation), State anhand des neuen Caches neu setzen.
  useEffect(() => {
    const fits = initial?.range === currentRange;
    setData(fits ? initial : null);
    setGeneratedAt(fits ? initialGeneratedAt : null);
    setError(null);
  }, [currentRange, initial, initialGeneratedAt]);

  async function laden() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ki/zusammenfassung?range=${currentRange}`);
      if (!res.ok) throw new Error("Fehler beim Laden");
      const json = await res.json();
      setData(json);
      if (json.generated_at) setGeneratedAt(json.generated_at);
    } catch {
      setError("KI-Zusammenfassung konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  // First-time state: kein Cache, nie generiert — "Generieren"-Button als Entry-Point
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

  // Initial-Load ohne vorhandene Cache-Daten
  if (loading && !data) {
    return (
      <div className="mb-6 card p-5">
        <div className="flex items-center gap-3">
          <div className="spinner w-5 h-5" />
          <span className="text-sm text-foreground-subtle">KI analysiert aktuelle Daten…</span>
        </div>
        {slowWarning && (
          <p className="mt-3 text-[12px] text-warning leading-relaxed" role="status" aria-live="polite">
            Die Anfrage dauert länger als üblich. OpenAI antwortet eventuell verzögert — bitte einen Moment Geduld.
          </p>
        )}
      </div>
    );
  }

  // Hard-Error ohne vorhandene Cache-Daten (weich bei bereits gecachten Daten — siehe unten)
  if (error && !data) {
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

  const stale = generatedAt ? istStale(generatedAt) : false;

  return (
    <div className="mb-6 card p-5">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <svg className="w-5 h-5 text-brand shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
          <h2 className="font-headline text-sm text-foreground tracking-tight">KI-Zusammenfassung</h2>
          {generatedAt && (
            <time
              dateTime={generatedAt}
              className={cn(
                "text-[11px] font-mono-amount",
                stale ? "text-warning" : "text-foreground-subtle",
              )}
            >
              Aktualisiert {relativeZeit(generatedAt)}
            </time>
          )}
        </div>
        <button
          onClick={laden}
          disabled={loading}
          className="text-xs text-brand hover:text-brand-light font-medium transition-colors disabled:opacity-50 shrink-0"
        >
          {loading ? "Lädt…" : "Neu generieren"}
        </button>
      </div>

      {error && (
        <p className="text-[11px] text-error mb-2">{error}</p>
      )}

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
