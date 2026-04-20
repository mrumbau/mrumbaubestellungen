"use client";

import { useState } from "react";
import Link from "next/link";

interface PrioBestellung {
  bestellnummer: string;
  prioritaet: "hoch" | "mittel" | "niedrig";
  score: number;
  grund: string;
}

interface PriorisierungErgebnis {
  bestellungen: PrioBestellung[];
  zusammenfassung: string;
}

// Prioritäts-Farben via Feedback-Tokens — semantic: hoch=error, mittel=warning, niedrig=success
const PRIO_STYLES = {
  hoch: { bg: "bg-error-bg", text: "text-error", badge: "bg-error-bg text-error", bar: "bg-error" },
  mittel: { bg: "bg-warning-bg", text: "text-warning", badge: "bg-warning-bg text-warning", bar: "bg-warning" },
  niedrig: { bg: "bg-success-bg", text: "text-success", badge: "bg-success-bg text-success", bar: "bg-success" },
};

export function DashboardPriorisierung() {
  const [data, setData] = useState<PriorisierungErgebnis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function laden() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ki/priorisierung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Fehler beim Laden");
      const json = await res.json();
      setData(json);
    } catch {
      setError("Priorisierung konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  if (!data && !loading && !error) {
    return (
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-headline text-sm text-foreground tracking-tight">KI-Priorisierung</h2>
        </div>
        <p className="text-xs text-foreground-faint mb-3">
          KI bewertet welche Bestellungen am dringendsten bearbeitet werden müssen.
        </p>
        <button
          onClick={laden}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-brand text-white rounded-lg hover:bg-brand-light transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
          </svg>
          Priorisierung starten
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-3">
          <div className="spinner w-5 h-5" />
          <span className="text-sm text-foreground-subtle">KI priorisiert Bestellungen...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-error-bg rounded-xl border border-error-border p-4">
        <p className="text-sm text-error">{error}</p>
        <button onClick={laden} className="mt-2 text-xs text-error underline">
          Erneut versuchen
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-headline text-sm text-foreground tracking-tight">KI-Priorisierung</h2>
        <button onClick={laden} className="text-xs text-brand hover:text-brand-light font-medium transition-colors">
          Aktualisieren
        </button>
      </div>

      <p className="text-xs text-foreground-muted mb-4 leading-relaxed">{data.zusammenfassung}</p>

      {data.bestellungen.length === 0 ? (
        <p className="text-xs text-foreground-faint text-center py-3">Keine offenen Bestellungen.</p>
      ) : (
        <div className="space-y-2">
          {data.bestellungen.map((b, i) => {
            const s = PRIO_STYLES[b.prioritaet];
            return (
              <div key={i} className={`${s.bg} rounded-lg p-3`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono-amount text-xs font-semibold text-foreground">{b.bestellnummer}</span>
                  <span className={`status-tag ${s.badge}`}>
                    <span className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-sm ${s.bar}`} />
                    {b.prioritaet}
                  </span>
                </div>
                <p className="text-xs text-foreground-muted mb-2">{b.grund}</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-white/60 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${b.score}%`,
                        background: `linear-gradient(90deg, #570006, #7a1a1f)`,
                      }}
                    />
                  </div>
                  <span className="font-mono-amount text-xs font-medium text-foreground-subtle w-8 text-right">{b.score}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
