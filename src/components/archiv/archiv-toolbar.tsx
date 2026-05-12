/**
 * Archiv-Toolbar — Tabs + Search + Date-Range + Selection-Mode + CSV-Export.
 * Aus archiv-client.tsx extrahiert (11.05.2026).
 *
 * Bewusst eine eigene Toolbar (statt FilterBar/ArtTabs reuse), weil das Archiv
 * Date-From/To statt Status-Filter braucht und die Tabs Projekte/Material/SU
 * statt Bestellungsart-Filter sind.
 */

import { exportToCsv, csvFilename } from "@/lib/export-csv";
import type { TabKey, PaidBestellung } from "./types";

export interface ArchivToolbarProps {
  activeTab: TabKey;
  tabCounts: Record<TabKey, number>;
  onTabChange: (next: TabKey) => void;

  searchQuery: string;
  onSearchChange: (next: string) => void;
  dateFrom: string;
  onDateFromChange: (next: string) => void;
  dateTo: string;
  onDateToChange: (next: string) => void;
  hasFilters: boolean;
  onResetFilters: () => void;

  selectionMode: boolean;
  onEnterSelectionMode: () => void;

  /** Daten für CSV-Export — nur relevant für material/subunternehmer Tabs */
  filteredMaterial: PaidBestellung[];
  filteredSU: PaidBestellung[];
  selectedIds: Set<string>;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "projekte", label: "Projekte" },
  { key: "material", label: "Material" },
  { key: "subunternehmer", label: "Subunternehmer" },
];

export function ArchivToolbar({
  activeTab,
  tabCounts,
  onTabChange,
  searchQuery,
  onSearchChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  hasFilters,
  onResetFilters,
  selectionMode,
  onEnterSelectionMode,
  filteredMaterial,
  filteredSU,
  selectedIds,
}: ArchivToolbarProps) {
  function handleCsvExport() {
    if (activeTab === "projekte") return;
    const items = activeTab === "material" ? filteredMaterial : filteredSU;
    const rows = selectedIds.size > 0 ? items.filter((o) => selectedIds.has(o.id)) : items;
    exportToCsv(csvFilename(`archiv-${activeTab}`), rows, [
      { header: "Bestellnr.", value: (b) => b.bestellnummer ?? "" },
      {
        header: activeTab === "subunternehmer" ? "Firma" : "Händler",
        value: (b) =>
          activeTab === "subunternehmer"
            ? b.subunternehmer_firma || b.haendler_name || ""
            : b.haendler_name ?? "",
      },
      { header: "Besteller", value: (b) => b.besteller_name },
      { header: "Projekt", value: (b) => b.projekt_name ?? "" },
      { header: "Betrag", value: (b) => b.betrag ?? 0, numeric: true },
      { header: "Bezahlt am", value: (b) => b.bezahlt_am.slice(0, 10) },
      { header: "Bezahlt von", value: (b) => b.bezahlt_von ?? "" },
    ]);
  }

  return (
    <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      {/* Tab-Pills */}
      <div className="flex items-center gap-1 p-1 bg-canvas rounded-lg">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeTab === tab.key
                ? "bg-white text-foreground shadow-sm"
                : "text-foreground-muted hover:text-foreground"
            }`}
          >
            {tab.label}
            {tabCounts[tab.key] > 0 && (
              <span
                className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                  activeTab === tab.key
                    ? "bg-brand text-white"
                    : "bg-line text-foreground-muted"
                }`}
              >
                {tabCounts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search + Date + Aktionen */}
      <div className="flex items-center gap-3 w-full sm:w-auto">
        <div className="relative flex-1 min-w-0">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-subtle"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Projekt, Bestellnummer, Händler..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-line rounded-lg text-sm text-foreground placeholder-foreground-faint focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)] transition-colors"
          />
        </div>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          title="Von"
          className="hidden md:block px-3 py-2.5 bg-surface border border-line rounded-lg text-sm text-foreground focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)] transition-colors"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          title="Bis"
          className="hidden md:block px-3 py-2.5 bg-surface border border-line rounded-lg text-sm text-foreground focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)] transition-colors"
        />
        {hasFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className="p-2.5 text-foreground-subtle hover:text-brand hover:bg-error-bg rounded-lg border border-line transition-colors shrink-0"
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
            onClick={onEnterSelectionMode}
            className="p-2.5 text-foreground-subtle hover:text-brand hover:bg-brand/[0.06] rounded-lg border border-line transition-colors shrink-0"
            title="Auswahl-Modus"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
          </button>
        )}
        {activeTab !== "projekte" && (
          <button
            type="button"
            onClick={handleCsvExport}
            title={
              selectedIds.size > 0
                ? `${selectedIds.size} ausgewählte als CSV exportieren`
                : "Alle sichtbaren als CSV exportieren"
            }
            className="inline-flex items-center gap-1.5 h-9 px-3 text-[14px] font-medium rounded-md border border-line bg-surface text-foreground hover:bg-surface-hover hover:border-line-strong transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] shrink-0"
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
        )}
      </div>
    </div>
  );
}
