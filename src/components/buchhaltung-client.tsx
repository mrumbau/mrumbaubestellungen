"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDatum, formatBetrag } from "@/lib/formatters";
import type { Rolle } from "@/lib/auth";
import { DatevExportModal } from "@/components/buchhaltung/datev-export-modal";
import { BuchhaltungSummaryCards } from "@/components/buchhaltung/summary-cards";
import { BuchhaltungTable } from "@/components/buchhaltung/buchhaltung-table";
import { PageHero } from "@/components/ui/page-hero";
import type { BuchhaltungRow } from "@/components/buchhaltung/types";

// BuchhaltungRow + isFaelligBald + isUeberfaellig sind nach
// src/components/buchhaltung/types.ts ausgelagert.

interface ProjektOption {
  id: string;
  name: string;
}

export function BuchhaltungClient({
  rows,
  projekte = [],
  rolle,
  reachedCap = false,
  hardCap = 500,
}: {
  rows: BuchhaltungRow[];
  projekte?: ProjektOption[];
  rolle: Rolle;
  reachedCap?: boolean;
  hardCap?: number;
}) {
  // 07.05.2026 — Client-side Pagination.
  // Vorher: Server-range(0,19) + Client-Tab/Filter → Filter sah nur 20er-Slice,
  // Bezahlt/Offen-Counts waren falsch über Pages, Suche traf nur Slice.
  // Jetzt: rows enthält ALLE freigegebenen (bis HARD_CAP) → Filter+Pagination
  // arbeiten auf der Gesamt-Menge.
  const PAGE_SIZE = 20;
  const totalCount = rows.length;
  const [suche, setSuche] = useState("");
  const [tab, setTab] = useState<"offen" | "bezahlt">("offen");
  const [bezahltLoading, setBezahltLoading] = useState<string | null>(null);
  const [bezahltError, setBezahltError] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [archivLoading, setArchivLoading] = useState(false);
  const [bulkBezahltLoading, setBulkBezahltLoading] = useState(false);
  // 12.05.2026 (Continuity-Patch): IDs der gerade bezahlt-markierten Rows
  // bekommen 1.2s Success-Green-Flash bevor das Tab-Filter sie ggf. nach
  // "Bezahlt" verschiebt.
  const [successFlashIds, setSuccessFlashIds] = useState<Set<string>>(new Set());
  const [showDatev, setShowDatev] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // 07.05.2026 — Page-State in URL ?page=N persistiert (Browser-Back von Detail
  // landet wieder auf zuletzt gewählter Page).
  const pageParam = searchParams.get("page");
  const currentPage = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;
  const setPageInUrl = (page: number) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (page <= 1) params.delete("page");
    else params.set("page", String(page));
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
  };

  const [localRows, setLocalRows] = useState(rows);

  // Props-Sync: wenn Server neue Daten liefert (z.B. nach Seitenwechsel), localRows aktualisieren
  useEffect(() => { setLocalRows(rows); }, [rows]);
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

  // 07.05.2026 — Pagination-Slice nach Filter+Tab.
  // totalPages aus gefilterten Resultaten → Pages stimmen mit aktuellem Filter.
  const totalPages = Math.max(1, Math.ceil(gefiltert.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedRows = gefiltert.slice(
    (safeCurrentPage - 1) * PAGE_SIZE,
    safeCurrentPage * PAGE_SIZE,
  );

  // Filter/Tab-Wechsel → Page 1 (Page-Param aus URL entfernen)
  useEffect(() => {
    if (pageParam && pageParam !== "1") setPageInUrl(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suche, tab, artFilter]);

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
    setPageInUrl(Math.max(1, Math.min(page, totalPages)));
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

  const kannBezahlen = rolle === "buchhaltung" || rolle === "admin";

  // 07.05.2026 — toggleBezahlt arbeitet jetzt auf DOKUMENT-Ebene (eine
  // Bestellung kann mehrere Rechnungen haben, jede mit eigenem Bezahlt-Status).
  // row.id ist die Doku-ID, der Endpoint /api/dokumente/[id]/bezahlt
  // markiert die Rechnung; ein DB-Trigger synchronisiert bestellung.bezahlt_am.
  async function toggleBezahlt(rowId: string, aktuellBezahlt: boolean) {
    setBezahltLoading(rowId);
    setBezahltError(null);

    const optimisticBezahltAm = !aktuellBezahlt ? new Date().toISOString() : null;
    setLocalRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              bezahlt_am: optimisticBezahltAm,
              bezahlt_von: !aktuellBezahlt ? (r.bezahlt_von ?? "…") : null,
            }
          : r,
      ),
    );

    try {
      const res = await fetch(`/api/dokumente/${rowId}/bezahlt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bezahlt: !aktuellBezahlt }),
      });
      if (!res.ok) {
        setLocalRows((prev) =>
          prev.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  bezahlt_am: aktuellBezahlt ? r.bezahlt_am : null,
                  bezahlt_von: aktuellBezahlt ? r.bezahlt_von : null,
                }
              : r,
          ),
        );
        const data = await res.json().catch(() => ({}));
        setBezahltError(data.error || "Fehler beim Aktualisieren des Zahlungsstatus");
        return;
      }
      const result = await res.json();
      setLocalRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? { ...r, bezahlt_von: result.bezahlt_von || null }
            : r,
        ),
      );
    } catch {
      setLocalRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                bezahlt_am: aktuellBezahlt ? r.bezahlt_am : null,
                bezahlt_von: aktuellBezahlt ? r.bezahlt_von : null,
              }
            : r,
        ),
      );
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
      const res = await fetch("/api/dokumente/archivieren", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setBezahltError(data.error || "Archivieren fehlgeschlagen");
        return;
      }
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

  /**
   * 11.05.2026 — Bulk-Bezahlt-Markieren via /api/dokumente/bulk-bezahlt.
   * Server skippt schon bezahlte / nicht freigegebene und liefert Summary
   * { marked, already_paid, skipped, errors }. Wir updaten Local-State nur
   * für die `marked`-IDs (skipped bleiben unangetastet).
   */
  async function bulkBezahltMarkieren(ids: string[]) {
    if (ids.length === 0) return;
    setBulkBezahltLoading(true);
    setBezahltError(null);
    try {
      const res = await fetch("/api/dokumente/bulk-bezahlt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBezahltError(data.error || "Bulk-Bezahlt fehlgeschlagen");
        return;
      }
      const marked: string[] = data.marked ?? [];
      const alreadyPaid: string[] = data.already_paid ?? [];
      const skipped: { id: string; reason: string }[] = data.skipped ?? [];
      const errors: { id: string; reason: string }[] = data.errors ?? [];
      const successIds = new Set([...marked, ...alreadyPaid]);
      const nowIso = new Date().toISOString();
      // Success-Flash zuerst — bevor localRows-Update das tab-Filter neu
      // evaluiert (potenziell Row aus "offen" entfernt).
      if (marked.length > 0) {
        setSuccessFlashIds(new Set(marked));
        setTimeout(() => setSuccessFlashIds(new Set()), 1300);
      }
      setLocalRows((prev) =>
        prev.map((r) =>
          successIds.has(r.id) && !r.bezahlt_am
            ? { ...r, bezahlt_am: nowIso, bezahlt_von: r.bezahlt_von ?? "…" }
            : r,
        ),
      );
      setSelectedIds(new Set());
      setSelectionMode(false);
      // Sichtbare Zusammenfassung statt stiller Erfolg
      if (skipped.length > 0 || errors.length > 0) {
        const parts: string[] = [];
        if (marked.length > 0) parts.push(`${marked.length} bezahlt`);
        if (alreadyPaid.length > 0) parts.push(`${alreadyPaid.length} schon bezahlt`);
        if (skipped.length > 0) parts.push(`${skipped.length} übersprungen`);
        if (errors.length > 0) parts.push(`${errors.length} Fehler`);
        setBezahltError(parts.join(" · "));
      }
    } catch {
      setBezahltError("Netzwerkfehler beim Bulk-Bezahlt");
    } finally {
      setBulkBezahltLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Bezahlt error banner */}
      {bezahltError && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-error-bg border border-error-border rounded-lg text-meta text-error">
          <span>{bezahltError}</span>
          <button type="button" onClick={() => setBezahltError(null)} className="text-error/70 hover:text-error shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* DATEV Export Modal — eigene Komponente mit eigenem State */}
      <DatevExportModal
        open={showDatev}
        onClose={() => setShowDatev(false)}
        projekte={projekte}
      />

      <PageHero
        eyebrow="Buchhaltung"
        title="Rechnungen"
        description={rolle === "besteller" ? "Zahlungsstatus deiner freigegebenen Rechnungen mit DATEV-Export." : "Freigegebene Rechnungen mit DATEV-Export und Bezahlt-Tracking."}
        tone="brand"
        marks
        actions={
          kannBezahlen && (
            <>
              <button
                onClick={() => setShowDatev(true)}
                className="flex items-center gap-2 px-3 py-2 text-body-sm font-medium border border-line text-foreground bg-surface rounded-lg hover:bg-input hover:border-brand/30 transition-colors"
              >
                <svg className="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                DATEV Export
              </button>
              <button
                onClick={exportCSV}
                className="flex items-center gap-2 px-3 py-2 text-body-sm font-medium border border-line text-foreground bg-surface rounded-lg hover:bg-input hover:border-brand/30 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                CSV Export
              </button>
            </>
          )
        }
      />

      {/* Summary Cards — eigene Komponente */}
      <BuchhaltungSummaryCards
        summeOffen={summeOffen}
        offeneCount={offeneRows.length}
        summeBezahlt={summeBezahlt}
        bezahlteCount={bezahlteRows.length}
        naechsteFaelligDatum={naechsteFaellig?.faelligkeitsdatum ?? null}
        summeMonat={summeMonat}
      />

      {/* Industrial-Line zwischen Summary-Snapshot und Tabs+Tabelle.
          12.05.2026 (DESIGN-Critique #6) — markiert Section-Wechsel. */}
      <div className="industrial-line" aria-hidden="true" />

      {/* Tabs + Suche */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-canvas rounded-lg">
          <button
            onClick={() => { setTab("offen"); setSuche(""); setSelectedIds(new Set()); setSelectionMode(false); }}
            className={`flex items-center gap-2 px-4 py-2 text-body-sm font-medium rounded-md transition-[background-color,color,box-shadow] duration-150 ease-out ${
              tab === "offen"
                ? "bg-surface text-foreground shadow-sm"
                : "text-foreground-muted hover:text-foreground"
            }`}
          >
            Offen
            {offeneRows.length > 0 && (
              <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                tab === "offen" ? "bg-brand text-white" : "bg-line text-foreground-muted"
              }`}>
                {offeneRows.length}
              </span>
            )}
          </button>
          <button
            onClick={() => { setTab("bezahlt"); setSuche(""); setSelectedIds(new Set()); setSelectionMode(false); }}
            className={`flex items-center gap-2 px-4 py-2 text-body-sm font-medium rounded-md transition-[background-color,color,box-shadow] duration-150 ease-out ${
              tab === "bezahlt"
                ? "bg-surface text-foreground shadow-sm"
                : "text-foreground-muted hover:text-foreground"
            }`}
          >
            Bezahlt
            {bezahlteRows.length > 0 && (
              <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                tab === "bezahlt" ? "bg-success text-white" : "bg-line text-foreground-muted"
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
            className="px-3 py-2.5 bg-surface border border-line rounded-lg text-body-sm text-foreground focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)] transition-colors"
          >
            <option value="alle">Alle Arten</option>
            <option value="material">Material</option>
            <option value="subunternehmer">Subunternehmer</option>
            <option value="abo">Abo / Vertrag</option>
          </select>
          <div className="relative flex-1 min-w-0">
            <svg aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              aria-label="Buchhaltung durchsuchen"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Suche nach Bestellnummer, Händler..."
              className="w-full pl-10 pr-4 py-2.5 bg-surface border border-line rounded-lg text-body-sm text-foreground placeholder-foreground-faint focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)] transition-colors"
            />
          </div>
          {!selectionMode && (
            <button
              type="button"
              onClick={() => setSelectionMode(true)}
              className="p-2.5 text-foreground-subtle hover:text-brand hover:bg-brand/[0.06] rounded-lg border border-line transition-colors shrink-0"
              title={tab === "offen" ? "Auswahl-Modus (Bulk-Bezahlt)" : "Auswahl-Modus (Archivieren)"}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tabelle — eigene Komponente */}
      <BuchhaltungTable
        paginatedRows={paginatedRows}
        aktiveRows={aktiveRows}
        tab={tab}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        gefiltert={gefiltert}
        onToggleSelectAll={toggleSelectAll}
        onToggleSelect={toggleSelect}
        kannBezahlen={kannBezahlen}
        bezahltLoading={bezahltLoading}
        archivLoading={archivLoading}
        onToggleBezahlt={toggleBezahlt}
        onArchivieren={archivieren}
        successFlashIds={successFlashIds}
      />

      {/* Bulk Action Bar — sticky bottom */}
      {selectionMode && (
        <div className="sticky bottom-4 z-20 mt-4 mx-auto max-w-xl">
          <div className="flex items-center justify-between gap-4 px-5 py-3 bg-sidebar-active text-white rounded-xl shadow-lg shadow-black/20">
            <span className="text-body-sm font-medium">
              {selectedIds.size > 0
                ? `${selectedIds.size} ${selectedIds.size === 1 ? "Rechnung" : "Rechnungen"} ausgewählt`
                : "Rechnungen auswählen"}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
                className="px-3 py-1.5 text-body-sm text-white/70 hover:text-white transition-colors"
              >
                Abbrechen
              </button>
              {selectedIds.size > 0 && tab === "offen" && (
                <button
                  type="button"
                  onClick={() => bulkBezahltMarkieren(Array.from(selectedIds))}
                  disabled={bulkBezahltLoading}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-body-sm font-semibold bg-success hover:bg-success/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={`${selectedIds.size} ausgewählte Rechnung${selectedIds.size === 1 ? "" : "en"} als bezahlt markieren — startet DATEV-Versand pro Rechnung im Hintergrund`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {bulkBezahltLoading ? "Markiere..." : `Als bezahlt (${selectedIds.size})`}
                </button>
              )}
              {selectedIds.size > 0 && tab === "bezahlt" && (
                <button
                  type="button"
                  onClick={() => archivieren(Array.from(selectedIds))}
                  disabled={archivLoading}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-body-sm font-semibold bg-brand hover:bg-brand-light rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
      <div className="mt-4 flex items-center justify-between text-body-sm">
        <span className="text-foreground-subtle">
          {gefiltert.length} {tab === "offen" ? "offen" : "bezahlt"}
          {gefiltert.length > 0 && (
            <span className="ml-2 font-mono-amount font-semibold text-foreground">
              Summe: {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
                gefiltert.reduce((sum, r) => sum + (r.betrag || 0), 0)
              )}
            </span>
          )}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(safeCurrentPage - 1)}
              disabled={safeCurrentPage <= 1}
              className="px-3 py-1.5 text-body-sm font-medium bg-surface border border-line rounded-lg hover:bg-input disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Vorherige
            </button>
            <span className="text-foreground-muted font-medium px-2 font-mono-amount text-meta">
              {safeCurrentPage} / {totalPages}
            </span>
            <button
              onClick={() => goToPage(safeCurrentPage + 1)}
              disabled={safeCurrentPage >= totalPages}
              className="px-3 py-1.5 text-body-sm font-medium bg-surface border border-line rounded-lg hover:bg-input disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Nächste
            </button>
          </div>
        )}
      </div>

      {/* HARD_CAP-Warnung wenn 500 erreicht */}
      {reachedCap && (
        <div className="mt-4 rounded-md border border-warning-border bg-warning-bg px-4 py-2 text-[12px] text-warning">
          Hard-Cap von {hardCap} freigegebenen Bestellungen erreicht. Älteste werden nicht angezeigt — bitte archivieren.
        </div>
      )}
    </div>
  );
}
