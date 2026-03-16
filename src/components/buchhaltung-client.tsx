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
  return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-headline text-2xl text-[#1a1a1a] tracking-tight">Buchhaltung</h1>
          <p className="text-[#9a9a9a] text-sm mt-1">Freigegebene Rechnungen</p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-2 border-[#570006] text-[#570006] rounded-lg hover:bg-[#570006] hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          CSV Export
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card card-hover p-5 relative overflow-hidden" style={{ borderTop: "3px solid #570006" }}>
          <div className="absolute top-0 left-0 right-0 h-8 opacity-[0.06]" style={{ background: "linear-gradient(180deg, #570006, transparent)" }} />
          <p className="text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase relative">Offene Rechnungen</p>
          <p className="font-mono-amount text-3xl font-bold text-[#1a1a1a] mt-2 relative">
            {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(summeOffen)}
          </p>
        </div>
        <div className="card card-hover p-5 relative overflow-hidden" style={{ borderTop: "3px solid #059669" }}>
          <div className="absolute top-0 left-0 right-0 h-8 opacity-[0.06]" style={{ background: "linear-gradient(180deg, #059669, transparent)" }} />
          <p className="text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase relative">Diesen Monat</p>
          <p className="font-mono-amount text-3xl font-bold text-[#1a1a1a] mt-2 relative">
            {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(summeMonat)}
          </p>
        </div>
        <div className="card card-hover p-5 relative overflow-hidden" style={{ borderTop: "3px solid #d97706" }}>
          <div className="absolute top-0 left-0 right-0 h-8 opacity-[0.06]" style={{ background: "linear-gradient(180deg, #d97706, transparent)" }} />
          <p className="text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase relative">Nächste Fällig</p>
          <p className="font-mono-amount text-3xl font-bold text-[#1a1a1a] mt-2 relative">
            {naechsteFaellig ? formatDatum(naechsteFaellig.faelligkeitsdatum) : "–"}
          </p>
        </div>
      </div>

      {/* Suche */}
      <div className="mt-6 relative max-w-sm">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9a9a9a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Suche nach Bestellnummer, Händler..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] placeholder-[#c4c2bf] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors"
        />
      </div>

      {/* Tabelle */}
      <div className="mt-4 card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#fafaf9] border-b border-[#e8e6e3] sticky top-0 z-10">
              <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Bestellnr.</th>
              <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Händler</th>
              <th className="px-4 py-3.5 text-right font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Betrag</th>
              <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Freigegeben von</th>
              <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Freigegeben am</th>
              <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Fällig</th>
              <th className="px-4 py-3.5 text-center font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">PDF</th>
            </tr>
          </thead>
          <tbody>
            {gefiltert.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[#9a9a9a]">
                  {rows.length === 0
                    ? "Noch keine freigegebenen Rechnungen."
                    : "Keine Rechnungen gefunden."}
                </td>
              </tr>
            ) : (
              gefiltert.map((r, i) => (
                <tr key={r.id} className={`table-row-hover border-b border-[#f0eeeb] ${i % 2 === 1 ? "bg-[#fdfcfb]" : ""}`}>
                  <td className="px-4 py-3.5">
                    <span className="font-mono-amount font-semibold text-[#570006]">
                      {r.bestellnummer || "–"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-[#1a1a1a]">{r.haendler_name || "–"}</td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="font-mono-amount font-semibold text-[#1a1a1a]">
                      {formatBetrag(r.betrag, r.waehrung)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-[#6b6b6b]">{r.freigegeben_von}</td>
                  <td className="px-4 py-3.5 text-[#9a9a9a] text-xs">{formatDatum(r.freigegeben_am)}</td>
                  <td className="px-4 py-3.5">
                    <span
                      className={
                        isUeberfaellig(r.faelligkeitsdatum)
                          ? "text-red-600 font-semibold font-mono-amount text-xs pulse-urgent"
                          : isFaelligBald(r.faelligkeitsdatum)
                          ? "text-amber-600 font-semibold font-mono-amount text-xs"
                          : "text-[#9a9a9a] text-xs"
                      }
                    >
                      {formatDatum(r.faelligkeitsdatum)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    {r.rechnung_id ? (
                      <a
                        href={`/api/pdfs/${r.rechnung_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center text-[#570006] hover:text-[#7a1a1f] transition-colors"
                        title="PDF herunterladen"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M6 20h12a2 2 0 002-2V8l-6-6H6a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      </a>
                    ) : (
                      <span className="text-[#d4d1cc]">–</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Summenzeile + Paginierung */}
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-[#9a9a9a]">
          {totalCount} Rechnung{totalCount !== 1 ? "en" : ""} gesamt
          {gefiltert.length > 0 && (
            <span className="ml-2 font-mono-amount font-semibold text-[#1a1a1a]">
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
              className="px-3 py-1.5 text-sm font-medium bg-white border border-[#e8e6e3] rounded-lg hover:bg-[#fafaf9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Vorherige
            </button>
            <span className="text-[#6b6b6b] font-medium px-2 font-mono-amount text-xs">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 text-sm font-medium bg-white border border-[#e8e6e3] rounded-lg hover:bg-[#fafaf9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Nächste
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
