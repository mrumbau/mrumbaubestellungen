"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDatum, formatBetrag } from "@/lib/formatters";

interface BuchhaltungRow {
  id: string;
  bestellnummer: string | null;
  haendler_name: string | null;
  betrag: number | null;
  waehrung: string;
  freigegeben_von: string;
  freigegeben_am: string | null;
  faelligkeitsdatum: string | null;
  rechnung_id: string | null;
}

function isFaelligBald(datum: string | null) {
  if (!datum) return false;
  const diff = new Date(datum).getTime() - Date.now();
  return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000; // innerhalb 7 Tage
}

function isUeberfaellig(datum: string | null) {
  if (!datum) return false;
  return new Date(datum).getTime() < Date.now();
}

export function BuchhaltungClient({
  rows,
  currentPage,
  totalPages,
  totalCount,
}: {
  rows: BuchhaltungRow[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
}) {
  const [suche, setSuche] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();

  const gefiltert = rows.filter((r) => {
    if (!suche) return true;
    const s = suche.toLowerCase();
    return (
      r.bestellnummer?.toLowerCase().includes(s) ||
      r.haendler_name?.toLowerCase().includes(s) ||
      r.freigegeben_von.toLowerCase().includes(s)
    );
  });

  // Summen berechnen
  const summeOffen = rows.reduce((sum, r) => sum + (r.betrag || 0), 0);
  const summeMonat = rows
    .filter((r) => {
      if (!r.freigegeben_am) return false;
      const d = new Date(r.freigegeben_am);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, r) => sum + (r.betrag || 0), 0);

  const naechsteFaellig = rows
    .filter((r) => r.faelligkeitsdatum && new Date(r.faelligkeitsdatum).getTime() >= Date.now())
    .sort((a, b) => new Date(a.faelligkeitsdatum!).getTime() - new Date(b.faelligkeitsdatum!).getTime())[0];

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", page.toString());
    router.push(`/buchhaltung?${params.toString()}`);
  }

  function exportCSV() {
    const header = "Bestellnr.;Händler;Betrag;Währung;Freigegeben von;Freigegeben am;Fällig\n";
    const lines = gefiltert.map((r) =>
      [
        r.bestellnummer || "",
        r.haendler_name || "",
        r.betrag != null ? r.betrag.toFixed(2).replace(".", ",") : "",
        r.waehrung,
        r.freigegeben_von,
        r.freigegeben_am ? formatDatum(r.freigegeben_am) : "",
        r.faelligkeitsdatum ? formatDatum(r.faelligkeitsdatum) : "",
      ].join(";")
    );
    const csv = header + lines.join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `buchhaltung_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Buchhaltung</h1>
          <p className="text-slate-500 mt-1">Freigegebene Rechnungen</p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-[#1E4D8C] text-white rounded-lg hover:bg-[#2E6BAD] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          CSV Export
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500 tracking-wide">Offene Rechnungen</p>
          <p className="text-lg font-bold text-slate-900 mt-1">
            {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(summeOffen)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500 tracking-wide">Diesen Monat</p>
          <p className="text-lg font-bold text-slate-900 mt-1">
            {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(summeMonat)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500 tracking-wide">Nächste Fällig</p>
          <p className="text-lg font-bold text-slate-900 mt-1">
            {naechsteFaellig ? formatDatum(naechsteFaellig.faelligkeitsdatum) : "–"}
          </p>
        </div>
      </div>

      {/* Suche */}
      <div className="mt-6">
        <input
          type="text"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Suche nach Bestellnummer, Händler..."
          className="w-full max-w-sm px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E4D8C] focus:border-transparent"
        />
      </div>

      {/* Tabelle */}
      <div className="mt-4 bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/80 text-left">
              <th className="px-4 py-3 font-semibold text-xs text-slate-500 tracking-wide">Bestellnr.</th>
              <th className="px-4 py-3 font-semibold text-xs text-slate-500 tracking-wide">Händler</th>
              <th className="px-4 py-3 font-semibold text-xs text-slate-500 tracking-wide">Betrag</th>
              <th className="px-4 py-3 font-semibold text-xs text-slate-500 tracking-wide">Freigegeben von</th>
              <th className="px-4 py-3 font-semibold text-xs text-slate-500 tracking-wide">Freigegeben am</th>
              <th className="px-4 py-3 font-semibold text-xs text-slate-500 tracking-wide">Fällig</th>
              <th className="px-4 py-3 font-semibold text-xs text-slate-500 tracking-wide">PDF</th>
            </tr>
          </thead>
          <tbody>
            {gefiltert.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                  {rows.length === 0
                    ? "Noch keine freigegebenen Rechnungen."
                    : "Keine Rechnungen gefunden."}
                </td>
              </tr>
            ) : (
              gefiltert.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3.5 font-semibold text-slate-900">
                    {r.bestellnummer || "–"}
                  </td>
                  <td className="px-4 py-3.5 text-slate-900">{r.haendler_name || "–"}</td>
                  <td className="px-4 py-3.5 font-semibold text-slate-900">
                    {formatBetrag(r.betrag, r.waehrung)}
                  </td>
                  <td className="px-4 py-3.5 text-slate-700">{r.freigegeben_von}</td>
                  <td className="px-4 py-3.5 text-slate-500">{formatDatum(r.freigegeben_am)}</td>
                  <td className="px-4 py-3.5">
                    <span
                      className={
                        isUeberfaellig(r.faelligkeitsdatum)
                          ? "text-red-600 font-semibold"
                          : isFaelligBald(r.faelligkeitsdatum)
                          ? "text-amber-600 font-semibold"
                          : "text-slate-500"
                      }
                    >
                      {formatDatum(r.faelligkeitsdatum)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    {r.rechnung_id ? (
                      <a
                        href={`/api/pdfs/${r.rechnung_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#1E4D8C] hover:text-[#2E6BAD] transition-colors"
                        title="PDF herunterladen"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M6 20h12a2 2 0 002-2V8l-6-6H6a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      </a>
                    ) : (
                      <span className="text-slate-300">–</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Summenzeile + Paginierung */}
      <div className="mt-3 flex items-center justify-between text-sm text-slate-500 px-1">
        <span>
          {totalCount} Rechnung{totalCount !== 1 ? "en" : ""} gesamt
          {gefiltert.length > 0 && (
            <span className="ml-2 font-semibold text-slate-900">
              Summe: {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
                gefiltert.reduce((sum, r) => sum + (r.betrag || 0), 0)
              )}
            </span>
          )}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="px-3 py-1.5 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Vorherige
            </button>
            <span className="text-slate-700 font-medium px-2">
              Seite {currentPage} von {totalPages}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Nächste
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
