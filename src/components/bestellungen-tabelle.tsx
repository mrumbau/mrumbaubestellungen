"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getStatusConfig } from "@/lib/status-config";
import { formatDatum, formatBetrag } from "@/lib/formatters";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { Bestellungsart } from "@/lib/bestellung-utils";

interface Bestellung {
  id: string;
  bestellnummer: string | null;
  haendler_name: string | null;
  besteller_kuerzel: string;
  besteller_name: string;
  betrag: number | null;
  betrag_ist_netto?: boolean;
  waehrung: string;
  status: string;
  hat_bestellbestaetigung: boolean;
  hat_lieferschein: boolean;
  hat_rechnung: boolean;
  bestellungsart?: Bestellungsart;
  subunternehmer_name?: string | null;
  hat_versandbestaetigung?: boolean;
  projekt_id: string | null;
  projekt_name: string | null;
  created_at: string;
}

interface ProjektOption {
  id: string;
  name: string;
  farbe: string;
}

function DokumentIcon({ vorhanden, onClick }: { vorhanden: boolean; onClick?: (e: React.MouseEvent) => void }) {
  if (vorhanden && onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="p-1 -m-1 rounded-md transition-all hover:bg-green-50 hover:scale-125 cursor-pointer group/dok"
        title="Klicken für Vorschau"
      >
        <svg className="w-4 h-4 text-green-600 group-hover/dok:text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </button>
    );
  }
  return vorhanden ? (
    <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ) : (
    <div className="w-4 h-4 rounded-full border-2 border-[#d4d1cc]" />
  );
}

type ArtFilter = "" | "material" | "subunternehmer" | "abo";

const STATUS_OPTIONS = [
  { value: "", label: "Alle Status" },
  { value: "offen", label: "Offen" },
  { value: "vollstaendig", label: "Vollständig" },
  { value: "abweichung", label: "Abweichung" },
  { value: "ls_fehlt", label: "LS fehlt" },
  { value: "freigegeben", label: "Freigegeben" },
];

export function BestellungenTabelle({
  bestellungen,
  currentPage,
  totalPages,
  totalCount,
  projekte = [],
  aktiverProjektFilter,
  aktiverProjektName,
  isAdmin = false,
}: {
  bestellungen: Bestellung[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
  projekte?: ProjektOption[];
  aktiverProjektFilter?: string | null;
  aktiverProjektName?: string | null;
  isAdmin?: boolean;
}) {
  const [suche, setSuche] = useState("");
  const [statusFilter, setStatusFilter] = useState("offen");
  const [artFilter, setArtFilter] = useState<ArtFilter>("");
  const [projektFilter, setProjektFilter] = useState(aktiverProjektFilter || "");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [freigabeLoadingId, setFreigabeLoadingId] = useState<string | null>(null);
  const [freigabeConfirmId, setFreigabeConfirmId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  useEffect(() => { setProjektFilter(aktiverProjektFilter || ""); }, [aktiverProjektFilter]);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Clear selection when filters change
  useEffect(() => { setSelected(new Set()); setSelectionMode(false); }, [suche, statusFilter, artFilter, projektFilter]);

  const gefiltert = useMemo(() => bestellungen.filter((b) => {
    const suchMatch =
      !suche ||
      b.bestellnummer?.toLowerCase().includes(suche.toLowerCase()) ||
      b.haendler_name?.toLowerCase().includes(suche.toLowerCase()) ||
      b.besteller_name?.toLowerCase().includes(suche.toLowerCase());

    const statusMatch = !statusFilter || b.status === statusFilter;
    const artMatch = !artFilter || (b.bestellungsart || "material") === artFilter;
    const projektMatch = !projektFilter || b.projekt_id === projektFilter;

    return suchMatch && statusMatch && artMatch && projektMatch;
  }), [bestellungen, suche, statusFilter, artFilter, projektFilter]);

  // Count per art for tab badges
  const artCounts = useMemo(() => {
    const counts = { material: 0, subunternehmer: 0, abo: 0 };
    for (const b of bestellungen) {
      const art = b.bestellungsart || "material";
      if (art in counts) counts[art as keyof typeof counts]++;
    }
    return counts;
  }, [bestellungen]);

  const projektFarbenMap = new Map(projekte.map((p) => [p.id, p.farbe]));

  const hasFilters = suche || statusFilter || artFilter || projektFilter;

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", page.toString());
    router.push(`/bestellungen?${params.toString()}`);
  }

  // Quick-Freigabe direkt aus der Tabelle
  async function handleQuickFreigabe(bestellungId: string) {
    setFreigabeConfirmId(null);
    setFreigabeLoadingId(bestellungId);
    try {
      const res = await fetch(`/api/bestellungen/${bestellungId}/freigeben`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        router.refresh();
      }
    } catch {
      window.alert("Freigabe fehlgeschlagen. Bitte erneut versuchen.");
    } finally { setFreigabeLoadingId(null); }
  }

  // Quick-PDF-Vorschau (bestellungId + Dokumenttyp → API sucht passendes Dokument)
  async function handlePreview(bestellungId: string, typ: string) {
    setPreviewId(bestellungId);
    setPreviewLoading(true);
    setPreviewUrl(null);
    try {
      const res = await fetch(`/api/pdfs/${bestellungId}?typ=${encodeURIComponent(typ)}`);
      if (res.ok) {
        const blob = await res.blob();
        setPreviewUrl(URL.createObjectURL(blob));
      }
    } catch {
      // PDF-Vorschau fehlgeschlagen — kein Alert nötig, Modal zeigt "Keine PDF verfügbar"
    } finally { setPreviewLoading(false); }
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewId(null);
    setPreviewUrl(null);
  }

  async function downloadZip(bestellungId: string) {
    setDownloadingId(bestellungId);
    try {
      const res = await fetch(`/api/pdfs/zip?bestellung_id=${bestellungId}`);
      if (!res.ok) {
        window.alert("Fehler beim Herunterladen der Dokumente. Bitte versuchen Sie es erneut.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="?([^"]+)"?/);
      link.download = match?.[1] || "Dokumente.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      window.alert("Fehler beim Herunterladen der Dokumente. Bitte versuchen Sie es erneut.");
    } finally {
      setDownloadingId(null);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === gefiltert.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(gefiltert.map((b) => b.id)));
    }
  }

  async function handleBulkDelete() {
    setDeleteLoading(true);
    try {
      const res = await fetch("/api/bestellungen/verwerfen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bestellung_ids: Array.from(selected) }),
      });
      if (res.ok) {
        setSelected(new Set());
        setSelectionMode(false);
        setShowDeleteDialog(false);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "Fehler beim Löschen der Bestellungen");
      }
    } catch {
      window.alert("Netzwerkfehler beim Löschen der Bestellungen");
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <>
      {/* Projekt-Filter Banner */}
      {aktiverProjektName && aktiverProjektFilter && (
        <div className="mt-4 flex items-center gap-2 px-4 py-2.5 bg-[#fafaf9] border border-[#e8e6e3] rounded-lg text-sm">
          <svg className="w-4 h-4 text-[#9a9a9a] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span className="text-[#9a9a9a]">Gefiltert nach Projekt:</span>
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

      {/* Art-Tabs + Search + Filters */}
      <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Pill-toggle tabs for Bestellungsart */}
        <div className="flex items-center gap-1 p-1 bg-[#f5f4f2] rounded-lg shrink-0">
          {([
            { key: "" as ArtFilter, label: "Alle" },
            { key: "material" as ArtFilter, label: "Material" },
            { key: "subunternehmer" as ArtFilter, label: "Subunternehmer" },
            { key: "abo" as ArtFilter, label: "Abo" },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setArtFilter(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
                artFilter === tab.key
                  ? "bg-white text-[#1a1a1a] shadow-sm"
                  : "text-[#6b6b6b] hover:text-[#1a1a1a]"
              }`}
            >
              {tab.label}
              {tab.key && artCounts[tab.key] > 0 && (
                <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                  artFilter === tab.key ? "bg-[#570006] text-white" : "bg-[#e8e6e3] text-[#6b6b6b]"
                }`}>
                  {artCounts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search + Dropdowns */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 min-w-0">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9a9a9a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Bestellnummer, Händler, Besteller..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] placeholder-[#c4c2bf] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="hidden md:block px-3.5 py-2.5 bg-white border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {projekte.length > 0 && (
            <select
              value={projektFilter}
              onChange={(e) => setProjektFilter(e.target.value)}
              className="hidden md:block px-3.5 py-2.5 bg-white border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors"
            >
              <option value="">Alle Projekte</option>
              {projekte.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          {hasFilters && (
            <button
              type="button"
              onClick={() => { setSuche(""); setStatusFilter(""); setArtFilter(""); setProjektFilter(""); }}
              className="p-2.5 text-[#9a9a9a] hover:text-[#570006] hover:bg-red-50 rounded-lg border border-[#e8e6e3] transition-colors shrink-0"
              title="Filter zurücksetzen"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          {!selectionMode && (
            <button
              type="button"
              onClick={() => setSelectionMode(true)}
              className="p-2.5 text-[#9a9a9a] hover:text-[#570006] hover:bg-[#570006]/[0.06] rounded-lg border border-[#e8e6e3] transition-colors shrink-0"
              title="Auswahl-Modus"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Mobile: Status + Projekt filter below */}
      <div className="flex gap-3 mt-3 md:hidden">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="flex-1 px-3.5 py-2.5 bg-white border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {projekte.length > 0 && (
          <select
            value={projektFilter}
            onChange={(e) => setProjektFilter(e.target.value)}
            className="flex-1 px-3.5 py-2.5 bg-white border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors"
          >
            <option value="">Alle Projekte</option>
            {projekte.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Table */}
      <div className="mt-4 card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#fafaf9] border-b border-[#e8e6e3]">
              {selectionMode && (
                <th className="px-3 py-3.5 w-10">
                  <input
                    type="checkbox"
                    checked={gefiltert.length > 0 && selected.size === gefiltert.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-[#d4d1cc] text-[#570006] focus:ring-[#570006]/20 cursor-pointer"
                  />
                </th>
              )}
              <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Bestellnr.</th>
              <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Händler / Firma</th>
              <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase hidden lg:table-cell">Projekt</th>
              <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase hidden md:table-cell">Datum</th>
              <th className="px-4 py-3.5 text-center font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase hidden sm:table-cell">Best.</th>
              <th className="px-4 py-3.5 text-center font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase hidden sm:table-cell">LS</th>
              <th className="px-4 py-3.5 text-center font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase hidden sm:table-cell">RE</th>
              <th className="px-4 py-3.5 text-center font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase hidden sm:table-cell">VS</th>
              <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Status</th>
              <th className="px-4 py-3.5 text-right font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Betrag</th>
              <th className="px-4 py-3.5 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {gefiltert.length === 0 ? (
              <tr>
                <td colSpan={selectionMode ? 12 : 11} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <svg className="w-8 h-8 text-[#d4d1cc]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p className="text-[#9a9a9a] text-sm">
                      {bestellungen.length === 0
                        ? "Noch keine Bestellungen vorhanden."
                        : "Keine Bestellungen gefunden."}
                    </p>
                    {hasFilters && (
                      <button
                        onClick={() => { setSuche(""); setStatusFilter(""); setArtFilter(""); setProjektFilter(""); }}
                        className="text-[#570006] hover:text-[#7a1a1f] text-sm font-medium transition-colors"
                      >
                        Filter zurücksetzen
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              gefiltert.map((b, i) => {
                const status = getStatusConfig(b.status);
                const artValue = b.bestellungsart || "material";
                const isSub = artValue === "subunternehmer";
                const isAbo = artValue === "abo";
                return (
                  <tr
                    key={b.id}
                    onClick={() => router.push(`/bestellungen/${b.id}`)}
                    className={`table-row-hover border-b border-[#f0eeeb] cursor-pointer group ${i % 2 === 1 ? "bg-[#fdfcfb]" : ""} ${selected.has(b.id) ? "bg-[#570006]/[0.03]" : ""}`}
                  >
                    {selectionMode && (
                      <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(b.id)}
                          onChange={() => toggleSelect(b.id)}
                          className="w-4 h-4 rounded border-[#d4d1cc] text-[#570006] focus:ring-[#570006]/20 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/bestellungen/${b.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-mono-amount font-semibold text-[#570006] hover:text-[#7a1a1f] transition-colors"
                      >
                        {b.bestellnummer || "–"}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-[#1a1a1a]">
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-[150px]">{b.haendler_name || "–"}</span>
                        {isSub && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 shrink-0">SUB</span>
                        )}
                        {isAbo && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-50 text-violet-700 border border-violet-200 shrink-0">
                            ABO
                          </span>
                        )}
                      </div>
                      {/* Mobile: show project inline */}
                      {b.projekt_name && (
                        <div className="lg:hidden mt-1 flex items-center gap-1.5 text-[11px] text-[#6b6b6b]">
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: projektFarbenMap.get(b.projekt_id!) || "#570006" }}
                          />
                          {b.projekt_name}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      {b.projekt_name ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-[#1a1a1a] max-w-[120px]">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: projektFarbenMap.get(b.projekt_id!) || "#570006" }}
                          />
                          <span className="truncate">{b.projekt_name}</span>
                        </span>
                      ) : (
                        <span className="text-[#d4d1cc] text-xs">–</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-[#9a9a9a] text-xs hidden md:table-cell whitespace-nowrap">
                      {formatDatum(b.created_at)}
                    </td>
                    <td className="px-4 py-3.5 text-center hidden sm:table-cell">
                      <div className="flex justify-center">
                        {(isSub || isAbo) ? (
                          <span className="text-[#d4d1cc]">&ndash;</span>
                        ) : (
                          <DokumentIcon vorhanden={b.hat_bestellbestaetigung} onClick={b.hat_bestellbestaetigung ? (e) => { e.stopPropagation(); handlePreview(b.id, "bestellbestaetigung"); } : undefined} />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center hidden sm:table-cell">
                      <div className="flex justify-center">
                        {(isSub || isAbo) ? (
                          <span className="text-[#d4d1cc]">&ndash;</span>
                        ) : (
                          <DokumentIcon vorhanden={b.hat_lieferschein} onClick={b.hat_lieferschein ? (e) => { e.stopPropagation(); handlePreview(b.id, "lieferschein"); } : undefined} />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center hidden sm:table-cell">
                      <div className="flex justify-center"><DokumentIcon vorhanden={b.hat_rechnung} onClick={b.hat_rechnung ? (e) => { e.stopPropagation(); handlePreview(b.id, "rechnung"); } : undefined} /></div>
                    </td>
                    <td className="px-4 py-3.5 text-center hidden sm:table-cell">
                      <div className="flex justify-center">
                        {(isSub || isAbo) ? (
                          <span className="text-[#d4d1cc]">&ndash;</span>
                        ) : (
                          <DokumentIcon vorhanden={b.hat_versandbestaetigung ?? false} onClick={(b.hat_versandbestaetigung) ? (e) => { e.stopPropagation(); handlePreview(b.id, "versandbestaetigung"); } : undefined} />
                        )}
                      </div>
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
                      {b.betrag_ist_netto && b.betrag != null && (
                        <span className="text-[10px] text-[#9a9a9a] ml-1">netto</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        {/* Quick-Freigabe */}
                        {b.status !== "freigegeben" && b.hat_rechnung && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setFreigabeConfirmId(b.id); }}
                            disabled={freigabeLoadingId === b.id}
                            className={`p-1.5 rounded-md transition-colors inline-flex ${
                              freigabeLoadingId === b.id
                                ? "text-emerald-600 animate-pulse"
                                : "text-[#c4c2bf] group-hover:text-[#9a9a9a] hover:!text-emerald-600 hover:!bg-emerald-50"
                            }`}
                            title="Rechnung freigeben"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                          </button>
                        )}
                        {/* Download */}
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            downloadZip(b.id);
                          }}
                          disabled={downloadingId === b.id}
                          className={`p-1.5 rounded-md transition-colors inline-flex ${
                            downloadingId === b.id
                              ? "text-[#570006] animate-pulse"
                              : "text-[#c4c2bf] group-hover:text-[#9a9a9a] hover:!text-[#570006] hover:!bg-[#570006]/[0.06]"
                          }`}
                          title="Alle Dokumente herunterladen"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                          </svg>
                        </button>
                      </div>
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
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="p-2 text-sm font-medium bg-white border border-[#e8e6e3] rounded-lg hover:bg-[#fafaf9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Vorherige Seite"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-[#6b6b6b] font-medium px-3 font-mono-amount text-xs">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="p-2 text-sm font-medium bg-white border border-[#e8e6e3] rounded-lg hover:bg-[#fafaf9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Nächste Seite"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Floating Bulk Action Bar — matching Buchhaltung archive style */}
      {selectionMode && (
        <div className="sticky bottom-4 z-20 mt-4 mx-auto max-w-xl">
          <div className="flex items-center justify-between gap-4 px-5 py-3 bg-[#1a1a1a] text-white rounded-xl shadow-lg shadow-black/20">
            <span className="text-sm font-medium">
              {selected.size > 0
                ? `${selected.size} ${selected.size === 1 ? "Bestellung" : "Bestellungen"} ausgewählt`
                : "Bestellungen auswählen"}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setSelectionMode(false); setSelected(new Set()); }}
                className="px-3 py-1.5 text-sm text-white/70 hover:text-white transition-colors"
              >
                Abbrechen
              </button>
              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={deleteLoading}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-[#570006] hover:bg-[#7a1a1f] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  {deleteLoading ? "Lösche..." : "Entfernen"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={showDeleteDialog}
        onCancel={() => { setShowDeleteDialog(false); setDeleteLoading(false); }}
        onConfirm={handleBulkDelete}
        title="Bestellungen entfernen"
        message={`${selected.size} Bestellung${selected.size !== 1 ? "en" : ""} und alle zugehörigen Dokumente unwiderruflich löschen?`}
        confirmLabel={deleteLoading ? "Lösche..." : "Endgültig löschen"}
        variant="danger"
      />

      {/* Quick-Freigabe Bestätigung */}
      <ConfirmDialog
        open={!!freigabeConfirmId}
        onCancel={() => setFreigabeConfirmId(null)}
        onConfirm={() => freigabeConfirmId && handleQuickFreigabe(freigabeConfirmId)}
        title="Rechnung freigeben"
        message="Soll die Rechnung an die Buchhaltung freigegeben werden?"
        confirmLabel="Freigeben"
        variant="default"
      />

      {/* PDF-Vorschau Modal */}
      {previewId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={closePreview}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-[90vw] max-w-4xl h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#f0eeeb]">
              <h3 className="font-headline text-sm text-[#1a1a1a] tracking-tight">PDF-Vorschau</h3>
              <button
                onClick={closePreview}
                className="p-1.5 rounded-lg text-[#9a9a9a] hover:text-[#1a1a1a] hover:bg-[#f5f4f2] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-hidden">
              {previewLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="spinner w-8 h-8 text-[#570006]" />
                </div>
              ) : previewUrl ? (
                <iframe
                  src={previewUrl}
                  className="w-full h-full border-0"
                  title="PDF-Vorschau"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-[#c4c2bf]">
                  <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                  <p className="text-sm">Keine PDF verfügbar</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
