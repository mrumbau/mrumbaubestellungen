"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArtTabs } from "@/components/ui/art-tabs";
import { useTableFilters, matchesFaelligkeitsFilter } from "@/lib/use-table-filters";
import { useBestellungenListRealtime } from "@/lib/hooks/use-bestellung-realtime";
import { FilterBar } from "@/components/ui/filter-bar";
import { STATUS_FILTER_OPTIONS } from "@/lib/status-config";
import {
  DataTable,
  DensityToggle,
  useTableDensity,
  BulkToolbar,
  Button,
  SavedViewsMenu,
  EmptyState,
  useToast,
  type SortState,
} from "@/components/ui";
import {
  IconSearch,
  IconX,
  IconCheck,
  IconTrash,
} from "@/components/ui/icons";
import { exportToCsv, csvFilename } from "@/lib/export-csv";
import { displayBestellnummer } from "@/lib/bestellung-utils";
import type { Bestellung, ProjektOption } from "@/components/bestellungen/types";
import { useBestellungColumns } from "@/components/bestellungen/use-bestellung-columns";
import { PdfPreviewModal } from "@/components/bestellungen/pdf-preview-modal";
import { BestellungenEmptyState } from "@/components/bestellungen/bestellungen-empty-state";
import { useBestellungenActions } from "@/components/bestellungen/use-bestellungen-actions";
import { useBestellungPreview } from "@/components/bestellungen/use-bestellung-preview";
import { useBestellungSavedViews, type ViewConfig } from "@/components/bestellungen/use-bestellung-saved-views";
import { BestellungenConfirmDialogs } from "@/components/bestellungen/bestellungen-confirm-dialogs";

// Bestellung + ProjektOption Types: src/components/bestellungen/types.ts.
// STATUS_FILTER_OPTIONS wird aus @/lib/status-config importiert.
// DokumentIcon: @/components/ui/cells/dokument-icon.

export function BestellungenTabelle({
  bestellungen,
  projekte = [],
  aktiverProjektFilter,
  aktiverProjektName,
}: {
  bestellungen: Bestellung[];
  projekte?: ProjektOption[];
  aktiverProjektFilter?: string | null;
  aktiverProjektName?: string | null;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // 07.05.2026 — Client-side Pagination.
  // Bestellungen kommen vom Server vollständig (oder bis HARD_CAP).
  // Filter+Sort+Pagination laufen alle hier — damit funktionieren Filter
  // korrekt über die Gesamt-Menge und Sort-Reihenfolge ist global.
  // 07.05.2026 (v2) — Page-State in URL ?page=N persistiert. Beim Browser-Back
  // von der Bestelldetail-Seite landet der User damit automatisch auf seiner
  // letzten Page (statt Page 1). Filter/Sort liegen weiterhin im React-State —
  // beim Wechsel wird der page-Param aus der URL entfernt (Reset auf Page 1).
  const PAGE_SIZE = 20;
  const totalCount = bestellungen.length;
  const pageParam = searchParams.get("page");
  const currentPage = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;
  const setPageInUrl = useCallback(
    (page: number) => {
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      if (page <= 1) params.delete("page");
      else params.set("page", String(page));
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    },
    [router, searchParams],
  );

  // Filters
  const filters = useTableFilters({
    defaultStatusFilter: "offen",
    projektFilter: aktiverProjektFilter || "",
  });
  const {
    suche, setSuche,
    statusFilter, setStatusFilter,
    artFilter, setArtFilter,
    projektFilter, setProjektFilter,
    faelligkeitsFilter, setFaelligkeitsFilter,
    hasFilters,
    reset: resetFilters,
  } = filters;
  useEffect(() => {
    setProjektFilter(aktiverProjektFilter || "");
  }, [aktiverProjektFilter]);

  // 06.05.2026 (Welle 4 Frontend-Adoption) — Realtime-Subscribe.
  // Auto-Refresh bei jedem INSERT/UPDATE/DELETE auf bestellungen mit 1.5s
  // Debounce gegen Burst-Updates (Re-Backfill-Cron). Server-Component lädt
  // dann die neue Page neu — inkl. der gerade angekommenen Mail.
  useBestellungenListRealtime();

  // Table state
  const [density, setDensity] = useTableDensity("bestellungen.density");
  const [sort, setSort] = useState<SortState>({ key: "created_at", direction: "desc" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Mehrfachauswahl-Modus: Checkbox-Spalte ist standardmäßig aus, der User
  // schaltet sie nur ein wenn er Bulk-Aktionen (z.B. Löschen) braucht.
  const [selectMode, setSelectMode] = useState(false);

  // Saved Views — Hook aus src/components/bestellungen/use-bestellung-saved-views.ts
  const {
    savedViews,
    activeViewId,
    setActiveViewId,
    applyView,
    currentConfig,
    currentConfigIsDirty,
  } = useBestellungSavedViews({
    suche,
    statusFilter,
    artFilter,
    projektFilter,
    faelligkeitsFilter,
    density,
    sort,
    applyFilterConfig: filters.applyConfig,
    setDensity,
    setSort,
  });

  // Async UI state — Hooks aus src/components/bestellungen/
  const actions = useBestellungenActions({ selected, setSelected });
  const {
    showDeleteDialog,
    setShowDeleteDialog,
    deleteLoading,
    handleBulkDelete,
    showFreigebenDialog,
    setShowFreigebenDialog,
    bulkFreigebenLoading,
    handleBulkFreigeben,
    freigabeLoadingId,
    freigabeConfirmId,
    setFreigabeConfirmId,
    handleQuickFreigabe,
  } = actions;
  const preview = useBestellungPreview();
  const { previewId, previewUrl, preloadPreview, handlePreview, closePreview } = preview;

  // Search input focus (/ shortcut)
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Clear selection when filters change
  useEffect(() => {
    setSelected(new Set());
  }, [suche, statusFilter, artFilter, projektFilter]);

  const gefiltert = useMemo(
    () =>
      bestellungen.filter((b) => {
        const sucheLc = suche.toLowerCase();
        const suchMatch =
          !suche ||
          b.bestellnummer?.toLowerCase().includes(sucheLc) ||
          b.haendler_name?.toLowerCase().includes(sucheLc) ||
          b.besteller_name?.toLowerCase().includes(sucheLc) ||
          // 07.05.2026 — auch Rechnungs-/Lieferschein-/Auftragsnummern aus
          // dokumente durchsuchen (z.B. Raab-Karcher-Sammelbestellung mit
          // mehreren Rechnungs-PDFs an einer Auftragsnr.)
          (b.doku_nummern || []).some((n) => n.toLowerCase().includes(sucheLc));

        const statusMatch =
          !statusFilter ||
          (statusFilter === "offen" ? b.status !== "freigegeben" : b.status === statusFilter);
        const artMatch = !artFilter || (b.bestellungsart || "material") === artFilter;
        const projektMatch = !projektFilter || b.projekt_id === projektFilter;
        const faelligkeitsMatch = matchesFaelligkeitsFilter(b, faelligkeitsFilter);

        return suchMatch && statusMatch && artMatch && projektMatch && faelligkeitsMatch;
      }),
    [bestellungen, suche, statusFilter, artFilter, projektFilter, faelligkeitsFilter],
  );

  // Client-side sort
  const sorted = useMemo(() => {
    if (!sort) return gefiltert;
    const arr = [...gefiltert];
    const dir = sort.direction === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let av: string | number | null | undefined;
      let bv: string | number | null | undefined;
      switch (sort.key) {
        case "bestellnummer":
          av = displayBestellnummer(a);
          bv = displayBestellnummer(b);
          break;
        case "haendler_name":
          av = (a.haendler_name || "").toLowerCase();
          bv = (b.haendler_name || "").toLowerCase();
          break;
        case "created_at":
          // bestelldatum bevorzugt für Sortierung (echtes Datum, nicht Erfassung)
          av = a.bestelldatum ?? a.created_at;
          bv = b.bestelldatum ?? b.created_at;
          break;
        case "betrag":
          av = a.betrag ?? 0;
          bv = b.betrag ?? 0;
          break;
        case "status":
          av = a.status;
          bv = b.status;
          break;
        default:
          return 0;
      }
      if (av! < bv!) return -1 * dir;
      if (av! > bv!) return 1 * dir;
      return 0;
    });
    return arr;
  }, [gefiltert, sort]);

  // 07.05.2026 — Client-side Pagination.
  // totalPages aus gefilterten Resultaten (nicht totalCount), damit User die
  // ECHTE Anzahl Pages für seine Filter sieht. Page 1 wenn Filter wechselt.
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedRows = useMemo(() => {
    const from = (safeCurrentPage - 1) * PAGE_SIZE;
    return sorted.slice(from, from + PAGE_SIZE);
  }, [sorted, safeCurrentPage]);

  // Filter/Sort-Wechsel → Page 1 (Page-Param aus URL entfernen).
  // Realtime-Refresh hält Page erhalten (Bestellungen-Array ändert sich,
  // aber Filter nicht → kein Reset).
  useEffect(() => {
    if (pageParam && pageParam !== "1") setPageInUrl(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suche, statusFilter, artFilter, projektFilter, faelligkeitsFilter, sort]);

  const artCounts = useMemo(() => {
    const counts = { material: 0, subunternehmer: 0, abo: 0 };
    for (const b of bestellungen) {
      const art = b.bestellungsart || "material";
      if (art in counts) counts[art as keyof typeof counts]++;
    }
    return counts;
  }, [bestellungen]);

  const projektFarbenMap = useMemo(
    () => new Map(projekte.map((p) => [p.id, p.farbe])),
    [projekte],
  );

  function goToPage(page: number) {
    setPageInUrl(Math.max(1, Math.min(page, totalPages)));
  }


  function handleCsvExport(rowsToExport: Bestellung[]) {
    const rows = rowsToExport.length > 0 ? rowsToExport : [];
    exportToCsv(csvFilename("bestellungen"), rows, [
      { header: "Bestellnr.", value: (b) => b.bestellnummer ?? "" },
      { header: "Händler", value: (b) => b.haendler_name ?? "" },
      { header: "Besteller", value: (b) => b.besteller_name },
      { header: "Bestellungsart", value: (b) => b.bestellungsart ?? "material" },
      { header: "Projekt", value: (b) => b.projekt_name ?? "" },
      { header: "Status", value: (b) => b.status },
      { header: "Betrag", value: (b) => b.betrag ?? 0, numeric: true },
      { header: "Währung", value: (b) => b.waehrung },
      { header: "Netto?", value: (b) => (b.betrag_ist_netto ? "Ja" : "Nein") },
      { header: "Bestellbestätigung", value: (b) => (b.hat_bestellbestaetigung ? "Ja" : "Nein") },
      { header: "Lieferschein", value: (b) => (b.hat_lieferschein ? "Ja" : "Nein") },
      { header: "Rechnung", value: (b) => (b.hat_rechnung ? "Ja" : "Nein") },
      { header: "Versand", value: (b) => (b.hat_versandbestaetigung ? "Ja" : "Nein") },
      { header: "Mahnung", value: (b) => (b.mahnung_am ? `${b.mahnung_count ?? 1}× seit ${b.mahnung_am.slice(0, 10)}` : "") },
      { header: "Erstellt", value: (b) => b.created_at.slice(0, 10) },
    ]);
  }


  // ─── Column definitions ─────────────────────────────────────────────────
  // Aus eigenem Hook in src/components/bestellungen/use-bestellung-columns.tsx.
  const columns = useBestellungColumns({
    projektFarbenMap,
    freigabeLoadingId,
    handlePreview,
    preloadPreview,
    setFreigabeConfirmId,
  });

  return (
    <>
      {/* Projekt-Filter Banner */}
      {aktiverProjektName && aktiverProjektFilter && (
        <div className="mt-4 flex items-center gap-2 px-4 py-2.5 bg-input border border-line rounded-lg text-sm">
          <svg
            className="w-4 h-4 text-foreground-subtle shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          <span className="text-foreground-subtle">Gefiltert nach Projekt:</span>
          <span className="font-semibold text-foreground">{aktiverProjektName}</span>
          <button
            onClick={() => router.push("/bestellungen")}
            className="ml-auto p-1 text-foreground-subtle hover:text-brand transition-colors"
            title="Filter entfernen"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Art-Tabs + Search + Filters */}
      <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <ArtTabs value={artFilter} onChange={setArtFilter} counts={artCounts} />

        <FilterBar
          suche={suche}
          onSucheChange={setSuche}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          projektFilter={projektFilter}
          onProjektFilterChange={setProjektFilter}
          hasFilters={hasFilters}
          onReset={filters.reset}
          statusOptions={STATUS_FILTER_OPTIONS}
          projekte={projekte.map((p) => ({ id: p.id, name: p.name }))}
          searchInputRef={searchInputRef}
        >
          <DensityToggle density={density} onChange={setDensity} />
          <button
            type="button"
            onClick={() => {
              setSelectMode((prev) => {
                if (prev) setSelected(new Set());
                return !prev;
              });
            }}
            aria-pressed={selectMode}
            title={selectMode ? "Auswahl-Modus beenden" : "Mehrere Bestellungen auswählen"}
            className={
              selectMode
                ? "inline-flex items-center gap-1.5 h-9 px-3 text-[14px] font-medium rounded-md border border-brand bg-brand/[0.08] text-brand transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
                : "inline-flex items-center gap-1.5 h-9 px-3 text-[14px] font-medium rounded-md border border-line bg-surface text-foreground hover:bg-surface-hover hover:border-line-strong transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
            }
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
              {selectMode && <path d="M5 8.5l2 2 4-4.5" />}
            </svg>
            Auswählen
          </button>
          <SavedViewsMenu<ViewConfig>
            views={savedViews.views}
            activeViewId={activeViewId}
            currentConfigIsDirty={currentConfigIsDirty}
            onApply={(view) => applyView(view)}
            onSave={(name) => {
              const id = savedViews.saveView(name, currentConfig, false);
              setActiveViewId(id);
            }}
            onDelete={(id) => {
              savedViews.deleteView(id);
              if (activeViewId === id) setActiveViewId(null);
            }}
            onToggleDefault={(id) => savedViews.toggleDefault(id)}
          />
          <button
            type="button"
            onClick={() => {
              const rows = selected.size > 0 ? sorted.filter((b) => selected.has(b.id)) : sorted;
              handleCsvExport(rows);
            }}
            title={
              selected.size > 0
                ? `${selected.size} ausgewählte als CSV exportieren`
                : "Alle sichtbaren als CSV exportieren"
            }
            className="inline-flex items-center gap-1.5 h-9 px-3 text-[14px] font-medium rounded-md border border-line bg-surface text-foreground hover:bg-surface-hover hover:border-line-strong transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5 text-foreground-subtle"
              aria-hidden="true"
            >
              <path d="M3 11v1.5a1 1 0 001 1h8a1 1 0 001-1V11M5.5 7.5L8 10l2.5-2.5M8 10V2" />
            </svg>
            CSV
          </button>
        </FilterBar>
      </div>

      {/* Mobile: Status + Projekt filter below */}
      <div className="flex gap-3 mt-3 md:hidden">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="flex-1 px-3.5 py-2.5 bg-surface border border-line rounded-lg text-sm text-foreground focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)] transition-colors"
        >
          {STATUS_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {projekte.length > 0 && (
          <select
            value={projektFilter}
            onChange={(e) => setProjektFilter(e.target.value)}
            className="flex-1 px-3.5 py-2.5 bg-surface border border-line rounded-lg text-sm text-foreground focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)] transition-colors"
          >
            <option value="">Alle Projekte</option>
            {projekte.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Bulk toolbar — sticky-top, Linear-Style */}
      <div className="mt-4">
        <BulkToolbar
          count={selected.size}
          label="Bestellungen"
          onClear={() => setSelected(new Set())}
          totalHint={`von ${sorted.length} sichtbar`}
        >
          {(() => {
            const freigabeFaehig = bestellungen.filter(
              (b) => selected.has(b.id) && b.hat_rechnung && b.status !== "freigegeben",
            ).length;
            return (
              <Button
                size="sm"
                variant="primary"
                iconLeft={<IconCheck />}
                onClick={() => setShowFreigebenDialog(true)}
                loading={bulkFreigebenLoading}
                disabled={freigabeFaehig === 0}
                title={
                  freigabeFaehig === 0
                    ? "Keine der ausgewählten Bestellungen ist freigabe-fähig (Rechnung fehlt oder bereits freigegeben)"
                    : `${freigabeFaehig} Bestellung${freigabeFaehig === 1 ? "" : "en"} freigeben`
                }
              >
                Freigeben{freigabeFaehig > 0 ? ` (${freigabeFaehig})` : ""}
              </Button>
            );
          })()}
          <Button
            size="sm"
            variant="destructive"
            iconLeft={<IconTrash />}
            onClick={() => setShowDeleteDialog(true)}
            loading={deleteLoading}
          >
            Entfernen
          </Button>
        </BulkToolbar>
      </div>

      {/* DataTable */}
      <div className="mt-4">
        <DataTable<Bestellung>
          columns={columns}
          data={paginatedRows}
          getRowId={(b) => b.id}
          ariaLabel="Bestellübersicht"
          density={density}
          selection={selectMode ? selected : undefined}
          onSelectionChange={selectMode ? setSelected : undefined}
          getSelectionAriaLabel={(b) =>
            `Bestellung ${displayBestellnummer(b)} auswählen`
          }
          sort={sort}
          onSortChange={setSort}
          onRowClick={(b) => router.push(`/bestellungen/${b.id}`)}
          emptyState={
            <BestellungenEmptyState
              totalCount={bestellungen.length}
              hasFilters={hasFilters}
              suche={suche}
              statusFilter={statusFilter}
              artFilter={artFilter}
              projektFilter={projektFilter}
              faelligkeitsFilter={faelligkeitsFilter}
              projekte={projekte}
              onResetFilters={resetFilters}
            />
          }
        />
      </div>

      {/* Pagination — basiert auf gefilterten Resultaten (sorted.length),
          NICHT totalCount. So sieht User die echten Pages für seine Filter. */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-foreground-subtle">
            {sorted.length === totalCount
              ? <>{totalCount} Bestellung{totalCount !== 1 ? "en" : ""} gesamt</>
              : <>{sorted.length} von {totalCount} Bestellungen sichtbar</>}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(safeCurrentPage - 1)}
              disabled={safeCurrentPage <= 1}
              className="p-2 text-sm font-medium bg-white border border-line rounded-lg hover:bg-input disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Vorherige Seite"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <span className="text-foreground-muted font-medium px-3 font-mono-amount text-xs">
              {safeCurrentPage} / {totalPages}
            </span>
            <button
              onClick={() => goToPage(safeCurrentPage + 1)}
              disabled={safeCurrentPage >= totalPages}
              className="p-2 text-sm font-medium bg-white border border-line rounded-lg hover:bg-input disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Nächste Seite"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      <BestellungenConfirmDialogs
        showDeleteDialog={showDeleteDialog}
        onCloseDeleteDialog={() => setShowDeleteDialog(false)}
        onConfirmDelete={handleBulkDelete}
        deleteLoading={deleteLoading}
        freigabeConfirmId={freigabeConfirmId}
        onCloseFreigabeConfirm={() => setFreigabeConfirmId(null)}
        onConfirmQuickFreigabe={handleQuickFreigabe}
        showFreigebenDialog={showFreigebenDialog}
        onCloseFreigebenDialog={() => setShowFreigebenDialog(false)}
        onConfirmBulkFreigeben={handleBulkFreigeben}
        bulkFreigebenLoading={bulkFreigebenLoading}
        bestellungen={bestellungen}
        selected={selected}
      />

      <PdfPreviewModal open={!!previewId} url={previewUrl} onClose={closePreview} />
    </>
  );
}
