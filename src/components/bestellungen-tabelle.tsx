"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getStatusConfig } from "@/lib/status-config";
import { formatDatum, formatBetrag } from "@/lib/formatters";
import { BESTELLUNGSART_LABELS } from "@/lib/bestellung-utils";
import type { Bestellungsart } from "@/lib/bestellung-utils";

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
  bestellungsart?: Bestellungsart;
  subunternehmer_name?: string | null;
  projekt_id: string | null;
  projekt_name: string | null;
  created_at: string;
}

interface ProjektOption {
  id: string;
  name: string;
  farbe: string;
}

function DokumentIcon({ vorhanden }: { vorhanden: boolean }) {
  return vorhanden ? (
    <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ) : (
    <div className="w-4 h-4 rounded-full border-2 border-[#d4d1cc]" />
  );
}

export function BestellungenTabelle({
  bestellungen,
  currentPage,
  totalPages,
  totalCount,
  projekte = [],
  aktiverProjektFilter,
  aktiverProjektName,
}: {
  bestellungen: Bestellung[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
  projekte?: ProjektOption[];
  aktiverProjektFilter?: string | null;
  aktiverProjektName?: string | null;
}) {
  const [suche, setSuche] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [bestellungsartFilter, setBestellungsartFilter] = useState("");
  const [projektFilter, setProjektFilter] = useState(aktiverProjektFilter || "");
  useEffect(() => { setProjektFilter(aktiverProjektFilter || ""); }, [aktiverProjektFilter]);
  const router = useRouter();
  const searchParams = useSearchParams();

  const gefiltert = bestellungen.filter((b) => {
    const suchMatch =
      !suche ||
      b.bestellnummer?.toLowerCase().includes(suche.toLowerCase()) ||
      b.haendler_name?.toLowerCase().includes(suche.toLowerCase()) ||
      b.besteller_name?.toLowerCase().includes(suche.toLowerCase());

    const statusMatch = !statusFilter || b.status === statusFilter;
    const artMatch = !bestellungsartFilter || (b.bestellungsart || "material") === bestellungsartFilter;
    const projektMatch = !projektFilter || b.projekt_id === projektFilter;

    return suchMatch && statusMatch && artMatch && projektMatch;
  });

  const projektFarbenMap = new Map(projekte.map((p) => [p.id, p.farbe]));

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", page.toString());
    router.push(`/bestellungen?${params.toString()}`);
  }

  return (
    <>
      {/* Filter */}
      <div className="flex gap-3 mt-6">
        <div className="relative flex-1 max-w-sm">
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
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3.5 py-2.5 bg-white border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30"
        >
          <option value="">Alle Status</option>
          <option value="erwartet">Erwartet</option>
          <option value="offen">Offen</option>
          <option value="vollstaendig">Vollständig</option>
          <option value="abweichung">Abweichung</option>
          <option value="ls_fehlt">LS fehlt</option>
          <option value="freigegeben">Freigegeben</option>
        </select>
        <select
          value={bestellungsartFilter}
          onChange={(e) => setBestellungsartFilter(e.target.value)}
          className="px-3.5 py-2.5 bg-white border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30"
        >
          <option value="">Alle Arten</option>
          {Object.entries(BESTELLUNGSART_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        {projekte.length > 0 && (
          <select
            value={projektFilter}
            onChange={(e) => setProjektFilter(e.target.value)}
            className="px-3.5 py-2.5 bg-white border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30"
          >
            <option value="">Alle Projekte</option>
            {projekte.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Projekt-Filter Banner */}
      {aktiverProjektName && aktiverProjektFilter && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-[#fafaf9] border border-[#e8e6e3] rounded-lg text-sm">
          <span className="text-[#9a9a9a]">Gefiltert nach:</span>
          <span className="font-semibold text-[#1a1a1a]">{aktiverProjektName}</span>
          <button
            onClick={() => router.push("/bestellungen")}
            className="ml-auto p-1 text-[#9a9a9a] hover:text-[#570006] transition-colors"
            title="Filter entfernen"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Table */}
      <div className="mt-4 card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#fafaf9] border-b border-[#e8e6e3] sticky top-0 z-10">
              <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Bestellnr.</th>
              <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Händler</th>
              <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Projekt</th>
              <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Datum</th>
              <th className="px-4 py-3.5 text-center font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Best.</th>
              <th className="px-4 py-3.5 text-center font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">LS</th>
              <th className="px-4 py-3.5 text-center font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">RE</th>
              <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Status</th>
              <th className="px-4 py-3.5 text-right font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Betrag</th>
              <th className="px-4 py-3.5 text-center font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase w-10"></th>
            </tr>
          </thead>
          <tbody>
            {gefiltert.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-[#9a9a9a]">
                  {bestellungen.length === 0
                    ? "Noch keine Bestellungen vorhanden."
                    : "Keine Bestellungen gefunden."}
                </td>
              </tr>
            ) : (
              gefiltert.map((b, i) => {
                const status = getStatusConfig(b.status);
                return (
                  <tr
                    key={b.id}
                    className={`table-row-hover border-b border-[#f0eeeb] ${i % 2 === 1 ? "bg-[#fdfcfb]" : ""}`}
                  >
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/bestellungen/${b.id}`}
                        className="font-mono-amount font-semibold text-[#570006] hover:text-[#7a1a1f] transition-colors"
                      >
                        {b.bestellnummer || "–"}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-[#1a1a1a]">
                      <div className="flex items-center gap-1.5">
                        {b.haendler_name || "–"}
                        {(b.bestellungsart || "material") === "subunternehmer" && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-50 text-cyan-700 border border-cyan-200">
                            SUB
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      {b.projekt_name ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-[#1a1a1a] max-w-[100px] truncate">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: projektFarbenMap.get(b.projekt_id!) || "#570006" }}
                          />
                          {b.projekt_name}
                        </span>
                      ) : (
                        <span className="text-[#c4c2bf] text-xs">–</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-[#9a9a9a] text-xs">
                      {formatDatum(b.created_at)}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <div className="flex justify-center">
                        {(b.bestellungsart || "material") === "subunternehmer" ? (
                          <span className="text-[#c4c2bf]">&ndash;</span>
                        ) : (
                          <DokumentIcon vorhanden={b.hat_bestellbestaetigung} />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <div className="flex justify-center">
                        {(b.bestellungsart || "material") === "subunternehmer" ? (
                          <span className="text-[#c4c2bf]">&ndash;</span>
                        ) : (
                          <DokumentIcon vorhanden={b.hat_lieferschein} />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <div className="flex justify-center"><DokumentIcon vorhanden={b.hat_rechnung} /></div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`status-tag ${status.bg} ${status.text}`}
                        style={{ ["--tag-color" as string]: status.color }}
                      >
                        <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-sm" style={{ background: status.color }} />
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="font-mono-amount font-semibold text-[#1a1a1a]">
                        {formatBetrag(b.betrag, b.waehrung)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <a
                        href={`/api/pdfs/zip?bestellung_id=${b.id}`}
                        download
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded-md text-[#9a9a9a] hover:text-[#570006] hover:bg-[#fafaf9] transition-colors inline-flex"
                        title="Alle Dokumente herunterladen"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-[#9a9a9a]">
            {totalCount} Bestellung{totalCount !== 1 ? "en" : ""} gesamt
          </span>
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
        </div>
      )}
    </>
  );
}
