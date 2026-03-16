"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getStatusConfig } from "@/lib/status-config";
import { formatDatum, formatBetrag } from "@/lib/formatters";

interface Bestellung {
  id: string;
  bestellnummer: string | null;
  haendler_name: string | null;
  besteller_kuerzel: string;
  besteller_name: string;
  betrag: number | null;
  waehrung: string;
  status: string;
  hat_bestellbestaetigung: boolean;
  hat_lieferschein: boolean;
  hat_rechnung: boolean;
  created_at: string;
}

function DokumentIcon({ vorhanden }: { vorhanden: boolean }) {
  return vorhanden ? (
    <svg
      className="w-5 h-5 text-green-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ) : (
    <svg
      className="w-5 h-5 text-slate-300"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function BestellungenTabelle({
  bestellungen,
  currentPage,
  totalPages,
  totalCount,
}: {
  bestellungen: Bestellung[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
}) {
  const [suche, setSuche] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();

  const gefiltert = bestellungen.filter((b) => {
    const suchMatch =
      !suche ||
      b.bestellnummer?.toLowerCase().includes(suche.toLowerCase()) ||
      b.haendler_name?.toLowerCase().includes(suche.toLowerCase()) ||
      b.besteller_name?.toLowerCase().includes(suche.toLowerCase());

    const statusMatch = !statusFilter || b.status === statusFilter;

    return suchMatch && statusMatch;
  });

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", page.toString());
    router.push(`/bestellungen?${params.toString()}`);
  }

  return (
    <>
      {/* Filter-Leiste */}
      <div className="flex gap-3 mt-6">
        <input
          type="text"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Suche nach Bestellnummer, Händler..."
          className="flex-1 max-w-sm px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E4D8C] focus:border-transparent"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E4D8C]"
        >
          <option value="">Alle Status</option>
          <option value="erwartet">Erwartet</option>
          <option value="offen">Offen</option>
          <option value="vollstaendig">Vollständig</option>
          <option value="abweichung">Abweichung</option>
          <option value="ls_fehlt">LS fehlt</option>
          <option value="freigegeben">Freigegeben</option>
        </select>
      </div>

      {/* Tabelle */}
      <div className="mt-4 bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/80 text-left">
              <th className="px-4 py-3 font-semibold text-xs text-slate-500 tracking-wide">
                Bestellnr.
              </th>
              <th className="px-4 py-3 font-semibold text-xs text-slate-500 tracking-wide">
                Händler
              </th>
              <th className="px-4 py-3 font-semibold text-xs text-slate-500 tracking-wide">
                Datum
              </th>
              <th className="px-4 py-3 font-semibold text-xs text-slate-500 tracking-wide text-center">
                Best.
              </th>
              <th className="px-4 py-3 font-semibold text-xs text-slate-500 tracking-wide text-center">
                LS
              </th>
              <th className="px-4 py-3 font-semibold text-xs text-slate-500 tracking-wide text-center">
                RE
              </th>
              <th className="px-4 py-3 font-semibold text-xs text-slate-500 tracking-wide">
                Status
              </th>
              <th className="px-4 py-3 font-semibold text-xs text-slate-500 tracking-wide">
                Betrag
              </th>
            </tr>
          </thead>
          <tbody>
            {gefiltert.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-12 text-center text-slate-400"
                >
                  {bestellungen.length === 0
                    ? "Noch keine Bestellungen vorhanden."
                    : "Keine Bestellungen gefunden."}
                </td>
              </tr>
            ) : (
              gefiltert.map((b) => {
                const status = getStatusConfig(b.status);
                return (
                  <tr
                    key={b.id}
                    className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/bestellungen/${b.id}`}
                        className="font-semibold text-[#1E4D8C] hover:underline"
                      >
                        {b.bestellnummer || "–"}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-slate-900">
                      {b.haendler_name || "–"}
                    </td>
                    <td className="px-4 py-3.5 text-slate-500">
                      {formatDatum(b.created_at)}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <DokumentIcon vorhanden={b.hat_bestellbestaetigung} />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <DokumentIcon vorhanden={b.hat_lieferschein} />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <DokumentIcon vorhanden={b.hat_rechnung} />
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${status.bg} ${status.text}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-slate-900">
                      {formatBetrag(b.betrag, b.waehrung)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginierung */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-slate-500">
            {totalCount} Bestellung{totalCount !== 1 ? "en" : ""} gesamt
          </span>
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
        </div>
      )}
    </>
  );
}
