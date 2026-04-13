"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDatum, formatBetrag } from "@/lib/formatters";
import type { Rolle } from "@/lib/auth";

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
  bezahlt_am: string | null;
  bezahlt_von: string | null;
  archiviert_am: string | null;
  bestellungsart?: "material" | "subunternehmer" | "abo" | null;
  hat_bestellbestaetigung?: boolean;
  hat_lieferschein?: boolean;
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

interface ProjektOption {
  id: string;
  name: string;
}

export function BuchhaltungClient({
  rows,
  currentPage,
  totalPages,
  totalCount,
  projekte = [],
  rolle,
}: {
  rows: BuchhaltungRow[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
  projekte?: ProjektOption[];
  rolle: Rolle;
}) {
  const [suche, setSuche] = useState("");
  const [tab, setTab] = useState<"offen" | "bezahlt">("offen");
  const [bezahltLoading, setBezahltLoading] = useState<string | null>(null);
  const [bezahltError, setBezahltError] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [archivLoading, setArchivLoading] = useState(false);
  const [showDatev, setShowDatev] = useState(false);
  const [datevLoading, setDatevLoading] = useState(false);
  const [datevError, setDatevError] = useState<string | null>(null);
  const [datevVon, setDatevVon] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [datevBis, setDatevBis] = useState(() => new Date().toISOString().slice(0, 10));
  const [datevProjekt, setDatevProjekt] = useState("");
  const [datevBeraterNr, setDatevBeraterNr] = useState("231925");
  const [datevMandantenNr, setDatevMandantenNr] = useState("30086");
  const [datevGegenKonto, setDatevGegenKonto] = useState("4980");
  const [datevAufwandsKonto, setDatevAufwandsKonto] = useState("");
  const [showErweitert, setShowErweitert] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [localRows, setLocalRows] = useState(rows);
  const [artFilter, setArtFilter] = useState<"alle" | "material" | "subunternehmer" | "abo">("alle");

  const offeneRows = localRows.filter((r) => !r.bezahlt_am);
  const bezahlteRows = localRows.filter((r) => !!r.bezahlt_am && !r.archiviert_am);
  const aktiveRows = tab === "offen" ? offeneRows : bezahlteRows;

  const gefiltert = aktiveRows.filter((r) => {
    if (artFilter !== "alle" && (r.bestellungsart || "material") !== artFilter) return false;
    if (!suche) return true;
    const s = suche.toLowerCase();
    return (
      r.bestellnummer?.toLowerCase().includes(s) ||
      r.haendler_name?.toLowerCase().includes(s) ||
      r.freigegeben_von.toLowerCase().includes(s)
    );
  });

  const summeOffen = offeneRows.reduce((sum, r) => sum + (r.betrag || 0), 0);
  const summeBezahlt = bezahlteRows.reduce((sum, r) => sum + (r.betrag || 0), 0);
  const summeMonat = rows
    .filter((r) => {
      if (!r.freigegeben_am) return false;
      const d = new Date(r.freigegeben_am);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, r) => sum + (r.betrag || 0), 0);

  const naechsteFaellig = offeneRows
    .filter((r) => r.faelligkeitsdatum && new Date(r.faelligkeitsdatum).getTime() >= Date.now())
    .sort((a, b) => new Date(a.faelligkeitsdatum!).getTime() - new Date(b.faelligkeitsdatum!).getTime())[0];

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", page.toString());
    router.push(`/buchhaltung?${params.toString()}`);
  }

  function exportCSV() {
    const header = "Bestellnr.;Händler;Betrag;Währung;Freigegeben von;Freigegeben am;Fällig;Bezahlt am;Bezahlt von\n";
    const lines = gefiltert.map((r) =>
      [
        r.bestellnummer || "",
        r.haendler_name || "",
        r.betrag != null ? r.betrag.toFixed(2).replace(".", ",") : "",
        r.waehrung,
        r.freigegeben_von,
        r.freigegeben_am ? formatDatum(r.freigegeben_am) : "",
        r.faelligkeitsdatum ? formatDatum(r.faelligkeitsdatum) : "",
        r.bezahlt_am ? formatDatum(r.bezahlt_am) : "",
        r.bezahlt_von || "",
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

  async function exportDatev() {
    setDatevLoading(true);
    setDatevError(null);
    try {
      const params = new URLSearchParams({ von: datevVon, bis: datevBis });
      if (datevProjekt) params.set("projekt_id", datevProjekt);
      if (datevBeraterNr) params.set("berater_nr", datevBeraterNr);
      if (datevMandantenNr) params.set("mandanten_nr", datevMandantenNr);
      if (datevGegenKonto) params.set("gegen_konto", datevGegenKonto);
      if (datevAufwandsKonto) params.set("aufwands_konto", datevAufwandsKonto);

      const res = await fetch(`/api/export/datev?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Export fehlgeschlagen");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `EXTF_Buchungsstapel_${datevVon}_${datevBis}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setShowDatev(false);
    } catch (e) {
      setDatevError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setDatevLoading(false);
    }
  }

  const kannBezahlen = rolle === "buchhaltung" || rolle === "admin";

  async function toggleBezahlt(bestellungId: string, aktuellBezahlt: boolean) {
    setBezahltLoading(bestellungId);
    setBezahltError(null);
    try {
      const res = await fetch(`/api/bestellungen/${bestellungId}/bezahlt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bezahlt: !aktuellBezahlt }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setBezahltError(data.error || "Fehler beim Aktualisieren des Zahlungsstatus");
        return;
      }
      const result = await res.json();
      // Update local state — no page reload needed
      setLocalRows((prev) =>
        prev.map((r) =>
          r.id === bestellungId
            ? {
                ...r,
                bezahlt_am: result.bezahlt ? new Date().toISOString() : null,
                bezahlt_von: result.bezahlt_von || null,
              }
            : r
        )
      );
    } catch {
      setBezahltError("Netzwerkfehler beim Aktualisieren des Zahlungsstatus");
    } finally {
      setBezahltLoading(null);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === gefiltert.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(gefiltert.map((r) => r.id)));
    }
  }

  async function archivieren(ids: string[]) {
    if (ids.length === 0) return;
    setArchivLoading(true);
    setBezahltError(null);
    try {
      const res = await fetch("/api/bestellungen/archivieren", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setBezahltError(data.error || "Archivieren fehlgeschlagen");
        return;
      }
      const result = await res.json();
      // Update local state — mark as archived
      setLocalRows((prev) =>
        prev.map((r) =>
          ids.includes(r.id)
            ? { ...r, archiviert_am: new Date().toISOString() }
            : r
        )
      );
      setSelectedIds(new Set());
      setSelectionMode(false);
    } catch {
      setBezahltError("Netzwerkfehler beim Archivieren");
    } finally {
      setArchivLoading(false);
    }
  }

  return (
    <div>
      {/* Bezahlt error banner */}
      {bezahltError && (
        <div className="mb-4 flex items-center justify-between gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <span>{bezahltError}</span>
          <button type="button" onClick={() => setBezahltError(null)} className="text-red-400 hover:text-red-600 shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}
      {/* DATEV Export Modal */}
      {showDatev && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowDatev(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-[#e8e6e3]">
              <div className="flex items-center justify-between">
                <h2 className="font-headline text-lg text-[#1a1a1a] tracking-tight">DATEV Export</h2>
                <button onClick={() => setShowDatev(false)} className="p-1 text-[#9a9a9a] hover:text-[#1a1a1a] transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-[#9a9a9a] mt-1">Buchungsstapel im DATEV-Format exportieren</p>
            </div>
            <div className="p-6 space-y-4">
              {/* Zeitraum */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase mb-1.5">Von</label>
                  <input type="date" value={datevVon} onChange={(e) => setDatevVon(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase mb-1.5">Bis</label>
                  <input type="date" value={datevBis} onChange={(e) => setDatevBis(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30" />
                </div>
              </div>

              {/* Quick-Date Buttons */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "Akt. Monat", fn: () => { const n = new Date(); setDatevVon(new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10)); setDatevBis(n.toISOString().slice(0, 10)); } },
                  { label: "Letzter Monat", fn: () => { const n = new Date(); const v = new Date(n.getFullYear(), n.getMonth() - 1, 1); const b = new Date(n.getFullYear(), n.getMonth(), 0); setDatevVon(v.toISOString().slice(0, 10)); setDatevBis(b.toISOString().slice(0, 10)); } },
                  { label: "Letztes Quartal", fn: () => { const n = new Date(); const q = Math.floor(n.getMonth() / 3); const v = new Date(n.getFullYear(), (q - 1) * 3, 1); const b = new Date(n.getFullYear(), q * 3, 0); setDatevVon(v.toISOString().slice(0, 10)); setDatevBis(b.toISOString().slice(0, 10)); } },
                  { label: "Letztes Jahr", fn: () => { const y = new Date().getFullYear() - 1; setDatevVon(`${y}-01-01`); setDatevBis(`${y}-12-31`); } },
                ].map((btn) => (
                  <button key={btn.label} type="button" onClick={btn.fn}
                    className="px-2.5 py-1 text-[11px] font-medium text-[#6b6b6b] bg-[#f5f4f2] border border-[#e8e6e3] rounded-md hover:bg-[#ebe9e6] hover:text-[#1a1a1a] transition-colors">
                    {btn.label}
                  </button>
                ))}
              </div>

              {/* Projekt-Filter */}
              {projekte.length > 0 && (
                <div>
                  <label className="block text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase mb-1.5">Projekt (optional)</label>
                  <select value={datevProjekt} onChange={(e) => setDatevProjekt(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30">
                    <option value="">Alle Projekte</option>
                    {projekte.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}

              {/* DATEV Info-Box */}
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                <p className="text-[11px] text-blue-700 leading-relaxed">
                  <span className="font-semibold">DATEV Format:</span> EXTF Version 700, Buchungsstapel. Kreditorenkonten werden automatisch pro Händler vergeben (70001+). Projekte werden als KOST1 exportiert.
                </p>
              </div>

              {/* Erweiterte Optionen (Collapsible) */}
              <div className="border border-[#e8e6e3] rounded-lg overflow-hidden">
                <button type="button" onClick={() => setShowErweitert(!showErweitert)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-[11px] font-semibold text-[#6b6b6b] hover:bg-[#fafaf9] transition-colors">
                  <span>Erweiterte Optionen</span>
                  <svg className={`w-3.5 h-3.5 transition-transform ${showErweitert ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showErweitert && (
                  <div className="px-3 pb-3 space-y-3 border-t border-[#e8e6e3]">
                    <div className="grid grid-cols-2 gap-3 pt-3">
                      <div>
                        <label className="block text-[11px] text-[#6b6b6b] mb-1">Berater-Nr.</label>
                        <input type="text" value={datevBeraterNr} onChange={(e) => setDatevBeraterNr(e.target.value.replace(/\D/g, "").slice(0, 7))}
                          maxLength={7} placeholder="231925"
                          className="w-full px-3 py-2 bg-white border border-[#e8e6e3] rounded-lg text-sm font-mono-amount text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30" />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#6b6b6b] mb-1">Mandanten-Nr.</label>
                        <input type="text" value={datevMandantenNr} onChange={(e) => setDatevMandantenNr(e.target.value.replace(/\D/g, "").slice(0, 7))}
                          maxLength={7} placeholder="30086"
                          className="w-full px-3 py-2 bg-white border border-[#e8e6e3] rounded-lg text-sm font-mono-amount text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#6b6b6b] mb-1">Gegenkonto</label>
                        <input type="text" value={datevGegenKonto} onChange={(e) => setDatevGegenKonto(e.target.value.replace(/\D/g, "").slice(0, 4))}
                          maxLength={4} placeholder="4980"
                          className="w-full px-3 py-2 bg-white border border-[#e8e6e3] rounded-lg text-sm font-mono-amount text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30" />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#6b6b6b] mb-1">Aufwandskonto</label>
                        <input type="text" value={datevAufwandsKonto} onChange={(e) => setDatevAufwandsKonto(e.target.value.replace(/\D/g, "").slice(0, 4))}
                          maxLength={4} placeholder="Optional"
                          className="w-full px-3 py-2 bg-white border border-[#e8e6e3] rounded-lg text-sm font-mono-amount text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {datevError && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">{datevError}</div>
              )}
            </div>
            <div className="p-6 border-t border-[#e8e6e3] flex justify-end gap-3">
              <button onClick={() => setShowDatev(false)} className="px-4 py-2 text-sm font-medium text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors">
                Abbrechen
              </button>
              <button onClick={exportDatev} disabled={datevLoading || !datevVon || !datevBis}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
                {datevLoading ? "Exportiere..." : "DATEV Export starten"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-headline text-2xl text-[#1a1a1a] tracking-tight">Buchhaltung</h1>
          <p className="text-[#9a9a9a] text-sm mt-1">
            {rolle === "besteller" ? "Zahlungsstatus deiner freigegebenen Rechnungen" : "Freigegebene Rechnungen"}
          </p>
        </div>
        {kannBezahlen && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDatev(true)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-[#e8e6e3] text-[#1a1a1a] bg-white rounded-lg hover:bg-[#fafaf9] hover:border-[#570006]/30 transition-colors"
            >
              <svg className="w-4 h-4 text-[#570006]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              DATEV Export
            </button>
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-[#e8e6e3] text-[#1a1a1a] bg-white rounded-lg hover:bg-[#fafaf9] hover:border-[#570006]/30 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              CSV Export
            </button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card card-hover p-5 relative overflow-hidden" style={{ borderTop: "3px solid #570006" }}>
          <div className="absolute top-0 left-0 right-0 h-8 opacity-[0.06]" style={{ background: "linear-gradient(180deg, #570006, transparent)" }} />
          <p className="text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase relative">Offene Rechnungen</p>
          <p className="font-mono-amount text-3xl font-bold text-[#1a1a1a] mt-2 relative">
            {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(summeOffen)}
          </p>
          <p className="text-[11px] text-[#9a9a9a] mt-1 relative">{offeneRows.length} Rechnung{offeneRows.length !== 1 ? "en" : ""}</p>
        </div>
        <div className="card card-hover p-5 relative overflow-hidden" style={{ borderTop: "3px solid #059669" }}>
          <div className="absolute top-0 left-0 right-0 h-8 opacity-[0.06]" style={{ background: "linear-gradient(180deg, #059669, transparent)" }} />
          <p className="text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase relative">Bezahlt</p>
          <p className="font-mono-amount text-3xl font-bold text-[#1a1a1a] mt-2 relative">
            {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(summeBezahlt)}
          </p>
          <p className="text-[11px] text-[#9a9a9a] mt-1 relative">{bezahlteRows.length} Rechnung{bezahlteRows.length !== 1 ? "en" : ""}</p>
        </div>
        <div className="card card-hover p-5 relative overflow-hidden" style={{ borderTop: "3px solid #d97706" }}>
          <div className="absolute top-0 left-0 right-0 h-8 opacity-[0.06]" style={{ background: "linear-gradient(180deg, #d97706, transparent)" }} />
          <p className="text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase relative">Nächste Fällig</p>
          <p className="font-mono-amount text-3xl font-bold text-[#1a1a1a] mt-2 relative">
            {naechsteFaellig ? formatDatum(naechsteFaellig.faelligkeitsdatum) : "–"}
          </p>
          <p className="text-[11px] text-[#9a9a9a] mt-1 relative">Diesen Monat: {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(summeMonat)}</p>
        </div>
      </div>

      {/* Tabs + Suche */}
      <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-[#f5f4f2] rounded-lg">
          <button
            onClick={() => { setTab("offen"); setSuche(""); setSelectedIds(new Set()); setSelectionMode(false); }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
              tab === "offen"
                ? "bg-white text-[#1a1a1a] shadow-sm"
                : "text-[#6b6b6b] hover:text-[#1a1a1a]"
            }`}
          >
            Offen
            {offeneRows.length > 0 && (
              <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                tab === "offen" ? "bg-[#570006] text-white" : "bg-[#e8e6e3] text-[#6b6b6b]"
              }`}>
                {offeneRows.length}
              </span>
            )}
          </button>
          <button
            onClick={() => { setTab("bezahlt"); setSuche(""); setSelectedIds(new Set()); setSelectionMode(false); }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
              tab === "bezahlt"
                ? "bg-white text-[#1a1a1a] shadow-sm"
                : "text-[#6b6b6b] hover:text-[#1a1a1a]"
            }`}
          >
            Bezahlt
            {bezahlteRows.length > 0 && (
              <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                tab === "bezahlt" ? "bg-emerald-600 text-white" : "bg-[#e8e6e3] text-[#6b6b6b]"
              }`}>
                {bezahlteRows.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            value={artFilter}
            onChange={(e) => setArtFilter(e.target.value as "alle" | "material" | "subunternehmer")}
            className="px-3 py-2.5 bg-white border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors"
          >
            <option value="alle">Alle Arten</option>
            <option value="material">Material</option>
            <option value="subunternehmer">Subunternehmer</option>
            <option value="abo">Abo / Vertrag</option>
          </select>
          <div className="relative flex-1 min-w-0">
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
          {tab === "bezahlt" && !selectionMode && (
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

      {/* Tabelle */}
      <div className="mt-4 card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#fafaf9] border-b border-[#e8e6e3] sticky top-0 z-10">
              {selectionMode && (
                <th className="px-3 py-3.5 w-10">
                  <input
                    type="checkbox"
                    checked={gefiltert.length > 0 && selectedIds.size === gefiltert.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-[#d4d1cc] text-[#570006] focus:ring-[#570006]/20 cursor-pointer"
                  />
                </th>
              )}
              <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Bestellnr.</th>
              <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Händler / SU</th>
              <th className="px-4 py-3.5 text-center font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Best.</th>
              <th className="px-4 py-3.5 text-center font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">LS</th>
              <th className="px-4 py-3.5 text-right font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Betrag</th>
              <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Freigegeben von</th>
              <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Freigegeben am</th>
              <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">Fällig</th>
              <th className="px-4 py-3.5 text-center font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">{tab === "offen" ? "Bezahlt" : "Bezahlt am"}</th>
              <th className="px-4 py-3.5 text-center font-semibold text-[10px] text-[#9a9a9a] tracking-widest uppercase">PDF</th>
            </tr>
          </thead>
          <tbody>
            {gefiltert.length === 0 ? (
              <tr>
                <td colSpan={selectionMode ? 11 : 10} className="px-4 py-12 text-center text-[#9a9a9a]">
                  {aktiveRows.length === 0
                    ? tab === "offen"
                      ? "Keine offenen Rechnungen."
                      : "Noch keine bezahlten Rechnungen."
                    : "Keine Rechnungen gefunden."}
                </td>
              </tr>
            ) : (
              gefiltert.map((r, i) => (
                <tr key={r.id} className={`table-row-hover border-b border-[#f0eeeb] ${i % 2 === 1 ? "bg-[#fdfcfb]" : ""} ${selectedIds.has(r.id) ? "bg-[#570006]/[0.03]" : ""}`}>
                  {selectionMode && (
                    <td className="px-3 py-3.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        className="w-4 h-4 rounded border-[#d4d1cc] text-[#570006] focus:ring-[#570006]/20 cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3.5">
                    <span className="font-mono-amount font-semibold text-[#570006]">
                      {r.bestellnummer || "–"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-[#1a1a1a]">
                    <span className="flex items-center gap-1.5">
                      {r.haendler_name || "–"}
                      {r.bestellungsart === "subunternehmer" && (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold tracking-wide bg-cyan-50 text-cyan-700 rounded">SUB</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    {r.bestellungsart === "subunternehmer" ? (
                      <span className="text-[#d4d1cc] text-xs">–</span>
                    ) : r.hat_bestellbestaetigung ? (
                      <svg className="w-4 h-4 text-green-600 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-[#d4d1cc] mx-auto" />
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    {r.bestellungsart === "subunternehmer" ? (
                      <span className="text-[#d4d1cc] text-xs">–</span>
                    ) : r.hat_lieferschein ? (
                      <svg className="w-4 h-4 text-green-600 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-[#d4d1cc] mx-auto" />
                    )}
                  </td>
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
                    {tab === "bezahlt" ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[11px] text-emerald-600 font-medium">{formatDatum(r.bezahlt_am)}</span>
                        <span className="text-[10px] text-[#9a9a9a]">{r.bezahlt_von}</span>
                        {kannBezahlen && (
                          <div className="flex items-center justify-center gap-1.5 mt-1">
                            <button
                              type="button"
                              onClick={() => archivieren([r.id])}
                              disabled={archivLoading}
                              className="p-1 rounded text-[#9a9a9a] hover:text-[#570006] hover:bg-[#570006]/[0.06] transition-colors"
                              title="Ins Archiv verschieben"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleBezahlt(r.id, true)}
                              disabled={bezahltLoading === r.id}
                              className="p-1 rounded text-[#d4d1cc] hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="Zahlung zurücksetzen"
                            >
                              {bezahltLoading === r.id ? (
                                <span className="text-[10px]">...</span>
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                                </svg>
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : kannBezahlen ? (
                      <button
                        type="button"
                        onClick={() => toggleBezahlt(r.id, false)}
                        disabled={bezahltLoading === r.id}
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-md border-2 transition-all border-[#d4d1cc] hover:border-emerald-400 text-transparent hover:text-emerald-400 ${
                          bezahltLoading === r.id ? "opacity-50 cursor-wait" : "cursor-pointer"
                        }`}
                        title="Als bezahlt markieren"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                    ) : (
                      <span className="inline-flex items-center justify-center w-6 h-6 text-[#d4d1cc]">–</span>
                    )}
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

      {/* Bulk Action Bar — sticky bottom */}
      {selectionMode && (
        <div className="sticky bottom-4 z-20 mt-4 mx-auto max-w-xl">
          <div className="flex items-center justify-between gap-4 px-5 py-3 bg-[#1a1a1a] text-white rounded-xl shadow-lg shadow-black/20">
            <span className="text-sm font-medium">
              {selectedIds.size > 0
                ? `${selectedIds.size} ${selectedIds.size === 1 ? "Rechnung" : "Rechnungen"} ausgewählt`
                : "Rechnungen auswählen"}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
                className="px-3 py-1.5 text-sm text-white/70 hover:text-white transition-colors"
              >
                Abbrechen
              </button>
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => archivieren(Array.from(selectedIds))}
                  disabled={archivLoading}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold bg-[#570006] hover:bg-[#7a1a1f] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  {archivLoading ? "Archiviere..." : "Archivieren"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Summenzeile + Paginierung */}
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-[#9a9a9a]">
          {gefiltert.length} {tab === "offen" ? "offen" : "bezahlt"}
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
