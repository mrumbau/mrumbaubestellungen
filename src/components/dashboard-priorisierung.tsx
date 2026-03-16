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

const PRIO_STYLES = {
  hoch: { bg: "bg-red-50", text: "text-red-700", badge: "bg-red-100 text-red-700", bar: "bg-red-400" },
  mittel: { bg: "bg-yellow-50", text: "text-yellow-700", badge: "bg-yellow-100 text-yellow-700", bar: "bg-yellow-400" },
  niedrig: { bg: "bg-green-50", text: "text-green-700", badge: "bg-green-100 text-green-700", bar: "bg-green-400" },
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
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-900">KI-Priorisierung</h2>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          KI bewertet welche Bestellungen am dringendsten bearbeitet werden müssen.
        </p>
        <button
          onClick={laden}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-gradient-to-r from-[#1E4D8C] to-[#2E6BAD] text-white rounded-lg hover:opacity-90 transition-opacity"
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
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-[#1E4D8C] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-500">KI priorisiert Bestellungen...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 rounded-xl border border-red-200 p-4">
        <p className="text-sm text-red-700">{error}</p>
        <button onClick={laden} className="mt-2 text-xs text-red-600 underline">
          Erneut versuchen
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-slate-900">KI-Priorisierung</h2>
        <button onClick={laden} className="text-xs text-[#1E4D8C] hover:underline">
          Aktualisieren
        </button>
      </div>

      <p className="text-xs text-slate-600 mb-4 leading-relaxed">{data.zusammenfassung}</p>

      {data.bestellungen.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-3">Keine offenen Bestellungen.</p>
      ) : (
        <div className="space-y-2">
          {data.bestellungen.map((b, i) => {
            const s = PRIO_STYLES[b.prioritaet];
            return (
              <div key={i} className={`${s.bg} rounded-lg p-3`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-900">{b.bestellnummer}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.badge}`}>
                    {b.prioritaet}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mb-2">{b.grund}</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${s.bar}`}
                      style={{ width: `${b.score}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-500 w-8 text-right">{b.score}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
