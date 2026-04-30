"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDatum, formatBetrag } from "@/lib/formatters";
import { DOKUMENT_CONFIG } from "@/lib/bestellung-utils";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { BulkToolbar, Button, EmptyState as UIEmptyState } from "@/components/ui";
import { IconTrash, IconFolderOpen } from "@/components/ui/icons";
import { exportToCsv, csvFilename } from "@/lib/export-csv";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ArchivedProjekt {
  id: string;
  name: string;
  beschreibung: string | null;
  farbe: string;
  budget: number | null;
  status: string;
  created_at: string;
}

interface PaidBestellung {
  id: string;
  bestellnummer: string | null;
  haendler_name: string | null;
  besteller_kuerzel: string;
  besteller_name: string;
  betrag: number | null;
  bezahlt_am: string;
  bezahlt_von: string | null;
  bestellungsart: string;
  projekt_id: string | null;
  projekt_name: string | null;
  hat_bestellbestaetigung: boolean;
  hat_lieferschein: boolean;
  hat_rechnung: boolean;
  hat_aufmass?: boolean;
  hat_leistungsnachweis?: boolean;
  subunternehmer_gewerk?: string | null;
  subunternehmer_firma?: string | null;
  subunternehmer_id?: string | null;
}

interface Dokument {
  id: string;
  bestellung_id: string;
  typ: string;
  storage_pfad: string | null;
  gesamtbetrag: number | null;
  created_at: string;
}

interface ProjektStats {
  count: number;
  volumen: number;
}

interface MonthGroup {
  key: string;
  label: string;
  items: PaidBestellung[];
  subtotal: number;
}

type TabKey = "projekte" | "material" | "subunternehmer";

interface ArchivClientProps {
  projekte: ArchivedProjekt[];
  materialOrders: PaidBestellung[];
  suOrders: PaidBestellung[];
  dokumenteMap: Record<string, Dokument[]>;
  projektStats: Record<string, ProjektStats>;
  summary: {
    totalProjekte: number;
    totalMaterial: number;
    totalSU: number;
    totalVolumen: number;
  };
  istAdmin: boolean;
  limitReached: { material: boolean; su: boolean };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByMonth(items: PaidBestellung[], dateField: keyof PaidBestellung): MonthGroup[] {
  const groups = new Map<string, { items: PaidBestellung[]; subtotal: number }>();

  for (const item of items) {
    const dateVal = item[dateField];
    if (!dateVal || typeof dateVal !== "string") continue;
    const d = new Date(dateVal);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(key)) {
      groups.set(key, { items: [], subtotal: 0 });
    }
    const g = groups.get(key)!;
    g.items.push(item);
    g.subtotal += Number(item.betrag) || 0;
  }

  return Array.from(groups.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, { items: monthItems, subtotal }]) => {
      const [year, month] = key.split("-");
      const d = new Date(Number(year), Number(month) - 1);
      const label = d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
      return { key, label: label.charAt(0).toUpperCase() + label.slice(1), items: monthItems, subtotal };
    });
}

function matchesSearchOrder(item: PaidBestellung, query: string): boolean {
  const q = query.toLowerCase();
  return (
    (item.bestellnummer || "").toLowerCase().includes(q) ||
    (item.haendler_name || "").toLowerCase().includes(q) ||
    (item.besteller_name || "").toLowerCase().includes(q) ||
    (item.projekt_name || "").toLowerCase().includes(q) ||
    (item.subunternehmer_firma || "").toLowerCase().includes(q) ||
    (item.subunternehmer_gewerk || "").toLowerCase().includes(q)
  );
}

function matchesSearchProjekt(item: ArchivedProjekt, query: string): boolean {
  const q = query.toLowerCase();
  return (
    item.name.toLowerCase().includes(q) ||
    (item.beschreibung || "").toLowerCase().includes(q)
  );
}

function inDateRange(dateStr: string | null, from: string, to: string): boolean {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ArchivClient({
  projekte,
  materialOrders,
  suOrders,
  dokumenteMap,
  projektStats,
  summary,
  istAdmin,
  limitReached,
}: ArchivClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("projekte");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showReactivateDialog, setShowReactivateDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [reactivateLoading, setReactivateLoading] = useState(false);
  const [localMaterial, setLocalMaterial] = useState(materialOrders);
  const [localSU, setLocalSU] = useState(suOrders);
  const [localProjekte, setLocalProjekte] = useState(projekte);
  const router = useRouter();

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasFilters = searchQuery || dateFrom || dateTo;

  const resetFilters = () => {
    setSearchQuery("");
    setDateFrom("");
    setDateTo("");
  };

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /**
   * Batch-toggle einer ganzen Gruppe (z.B. ein Monat).
   * Single setState statt O(n) toggleSelect-Loop — verhindert Renders-Storm
   * bei großen Gruppen (F3.12).
   */
  function toggleGroupItems(ids: string[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      return next;
    });
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    setDeleteLoading(true);
    try {
      if (activeTab === "projekte") {
        // Hard-delete: Projekte im Archiv endgültig löschen
        const results = await Promise.all(
          Array.from(selectedIds).map((id) =>
            fetch(`/api/projekte/${id}?hard=true`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
            })
          )
        );
        if (results.every((r) => r.ok)) {
          setLocalProjekte((prev) => prev.filter((p) => !selectedIds.has(p.id)));
          setSelectedIds(new Set());
          setSelectionMode(false);
          setShowDeleteDialog(false);
          router.refresh();
        }
      } else {
        const res = await fetch("/api/bestellungen/verwerfen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bestellung_ids: Array.from(selectedIds) }),
        });
        if (res.ok) {
          setLocalMaterial((prev) => prev.filter((o) => !selectedIds.has(o.id)));
          setLocalSU((prev) => prev.filter((o) => !selectedIds.has(o.id)));
          setSelectedIds(new Set());
          setSelectionMode(false);
          setShowDeleteDialog(false);
          router.refresh();
        }
      }
    } catch { /* silent */ }
    finally { setDeleteLoading(false); }
  }

  async function handleBulkReactivate() {
    setReactivateLoading(true);
    try {
      const results = await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/projekte/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "aktiv" }),
          })
        )
      );
      if (results.every((r) => r.ok)) {
        setLocalProjekte((prev) => prev.filter((p) => !selectedIds.has(p.id)));
        setSelectedIds(new Set());
        setSelectionMode(false);
        setShowReactivateDialog(false);
        router.refresh();
      }
    } catch { /* silent */ }
    finally { setReactivateLoading(false); }
  }

  // Filtered data
  const filteredProjekte = useMemo(() => {
    return localProjekte.filter((p) => {
      if (searchQuery && !matchesSearchProjekt(p, searchQuery)) return false;
      if ((dateFrom || dateTo) && !inDateRange(p.created_at, dateFrom, dateTo)) return false;
      return true;
    });
  }, [localProjekte, searchQuery, dateFrom, dateTo]);

  const filteredMaterial = useMemo(() => {
    return localMaterial.filter((o) => {
      if (searchQuery && !matchesSearchOrder(o, searchQuery)) return false;
      if ((dateFrom || dateTo) && !inDateRange(o.bezahlt_am, dateFrom, dateTo)) return false;
      return true;
    });
  }, [localMaterial, searchQuery, dateFrom, dateTo]);

  const filteredSU = useMemo(() => {
    return localSU.filter((o) => {
      if (searchQuery && !matchesSearchOrder(o, searchQuery)) return false;
      if ((dateFrom || dateTo) && !inDateRange(o.bezahlt_am, dateFrom, dateTo)) return false;
      return true;
    });
  }, [localSU, searchQuery, dateFrom, dateTo]);

  const allOrders = useMemo(() => [...localMaterial, ...localSU], [localMaterial, localSU]);

  const tabCounts: Record<TabKey, number> = {
    projekte: filteredProjekte.length,
    material: filteredMaterial.length,
    subunternehmer: filteredSU.length,
  };

  return (
    <div>
      {/* Header — matches Buchhaltung/Bestellungen pattern */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-headline text-2xl text-foreground tracking-tight">Archiv</h1>
          <p className="text-foreground-subtle text-sm mt-1">Abgeschlossene Projekte und archivierte Rechnungen</p>
        </div>
      </div>

      {/* Summary Stats — same pattern as Buchhaltung */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {([
          { label: "Projekte", value: summary.totalProjekte, color: "#7c3aed", isCurrency: false },
          { label: "Material", value: summary.totalMaterial, color: "#2563eb", isCurrency: false },
          { label: "Subunternehmer", value: summary.totalSU, color: "#d97706", isCurrency: false },
          { label: "Gesamtvolumen", value: summary.totalVolumen, color: "#570006", isCurrency: true },
        ] as const).map((card) => (
          <div
            key={card.label}
            className="card card-hover p-5 relative overflow-hidden"
            style={{ borderTop: `3px solid ${card.color}` }}
          >
            <div
              className="absolute top-0 left-0 right-0 h-8 opacity-[0.06]"
              style={{ background: `linear-gradient(180deg, ${card.color}, transparent)` }}
            />
            <p className="text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase relative">{card.label}</p>
            <p className="font-mono-amount text-3xl font-bold text-foreground mt-2 relative">
              {card.isCurrency ? formatBetrag(card.value) : card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Tabs + Search — matches Buchhaltung pattern */}
      <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-canvas rounded-lg">
          {([
            { key: "projekte" as TabKey, label: "Projekte" },
            { key: "material" as TabKey, label: "Material" },
            { key: "subunternehmer" as TabKey, label: "Subunternehmer" },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setExpandedIds(new Set()); exitSelectionMode(); }}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
                activeTab === tab.key
                  ? "bg-white text-foreground shadow-sm"
                  : "text-foreground-muted hover:text-foreground"
              }`}
            >
              {tab.label}
              {tabCounts[tab.key] > 0 && (
                <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                  activeTab === tab.key ? "bg-brand text-white" : "bg-line text-foreground-muted"
                }`}>
                  {tabCounts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 min-w-0">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Projekt, Bestellnummer, Händler..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-line rounded-lg text-sm text-foreground placeholder-foreground-faint focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand/30 transition-colors"
            />
          </div>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="Von"
            className="hidden md:block px-3 py-2.5 bg-white border border-line rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand/30 transition-colors"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title="Bis"
            className="hidden md:block px-3 py-2.5 bg-white border border-line rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand/30 transition-colors"
          />
          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
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
              onClick={() => setSelectionMode(true)}
              className="p-2.5 text-foreground-subtle hover:text-brand hover:bg-brand/[0.06] rounded-lg border border-line transition-colors shrink-0"
              title="Auswahl-Modus"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </button>
          )}
          {activeTab !== "projekte" && (
            <button
              type="button"
              onClick={() => {
                const items =
                  activeTab === "material" ? filteredMaterial : filteredSU;
                const rows =
                  selectedIds.size > 0
                    ? items.filter((o) => selectedIds.has(o.id))
                    : items;
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
              }}
              title={
                selectedIds.size > 0
                  ? `${selectedIds.size} ausgewählte als CSV exportieren`
                  : "Alle sichtbaren als CSV exportieren"
              }
              className="inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-medium rounded-md border border-line bg-surface text-foreground hover:bg-surface-hover hover:border-line-strong transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] shrink-0"
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

      {/* Tab Content */}
      <div className="mt-4">
        {activeTab === "projekte" && (
          <ProjekteTab
            projekte={filteredProjekte}
            projektStats={projektStats}
            allOrders={allOrders}
            expandedIds={expandedIds}
            toggleExpand={toggleExpand}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
          />
        )}

        {activeTab === "material" && (
          <OrdersTab
            orders={filteredMaterial}
            dokumenteMap={dokumenteMap}
            expandedIds={expandedIds}
            toggleExpand={toggleExpand}
            type="material"
            limitReached={limitReached.material}
            istAdmin={istAdmin}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            toggleGroupItems={toggleGroupItems}
          />
        )}

        {activeTab === "subunternehmer" && (
          <OrdersTab
            orders={filteredSU}
            dokumenteMap={dokumenteMap}
            expandedIds={expandedIds}
            toggleExpand={toggleExpand}
            type="subunternehmer"
            limitReached={limitReached.su}
            istAdmin={istAdmin}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            toggleGroupItems={toggleGroupItems}
          />
        )}
      </div>

      {/* Bulk Toolbar — sticky top, appears when selection > 0. Linear-Style. */}
      {selectionMode && (
        <div className="mt-4">
          <BulkToolbar
            count={selectedIds.size}
            label={activeTab === "projekte" ? "Projekte" : "Einträge"}
            onClear={exitSelectionMode}
          >
            {activeTab === "projekte" && (
              <Button
                size="sm"
                variant="subtle"
                onClick={() => setShowReactivateDialog(true)}
                loading={reactivateLoading}
                className="bg-success-bg text-success hover:bg-success-bg/80 border-success-border"
                iconLeft={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className="h-3.5 w-3.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
                    />
                  </svg>
                }
              >
                Reaktivieren
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              loading={deleteLoading}
              iconLeft={<IconTrash />}
            >
              Entfernen
            </Button>
          </BulkToolbar>
        </div>
      )}

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={showDeleteDialog}
        onCancel={() => { setShowDeleteDialog(false); setDeleteLoading(false); }}
        onConfirm={handleBulkDelete}
        title={activeTab === "projekte" ? "Projekte löschen" : "Archivierte Einträge löschen"}
        message={activeTab === "projekte"
          ? `${selectedIds.size} ${selectedIds.size === 1 ? "Projekt" : "Projekte"} endgültig archivieren? Die zugehörigen Bestellungen bleiben erhalten.`
          : `${selectedIds.size} ${selectedIds.size === 1 ? "Eintrag" : "Einträge"} und alle zugehörigen Dokumente unwiderruflich löschen?`}
        confirmLabel={deleteLoading ? "Lösche..." : "Endgültig löschen"}
        variant="danger"
      />

      {/* Confirm Reactivate Dialog */}
      <ConfirmDialog
        open={showReactivateDialog}
        onCancel={() => { setShowReactivateDialog(false); setReactivateLoading(false); }}
        onConfirm={handleBulkReactivate}
        title="Projekte reaktivieren"
        message={`${selectedIds.size} ${selectedIds.size === 1 ? "Projekt" : "Projekte"} wieder auf „Aktiv" setzen?`}
        confirmLabel={reactivateLoading ? "..." : "Reaktivieren"}
        variant="default"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

const EMPTY_MESSAGES: Record<TabKey, { title: string; description: string }> = {
  projekte: {
    title: "Keine abgeschlossenen Projekte",
    description: 'Projekte mit Status "Abgeschlossen" landen hier und bleiben durchsuchbar, ohne die aktive Liste zu belasten.',
  },
  material: {
    title: "Keine archivierten Material-Bestellungen",
    description: "Bezahlte Material-Rechnungen werden nach der Buchung automatisch hierher verschoben.",
  },
  subunternehmer: {
    title: "Keine archivierten SU-Rechnungen",
    description: "Bezahlte Subunternehmer-Rechnungen werden nach der Buchung automatisch hierher verschoben.",
  },
};

function EmptyState({ type }: { type: TabKey }) {
  const msg = EMPTY_MESSAGES[type];
  return (
    <UIEmptyState
      tone="info"
      icon={<IconFolderOpen className="w-5 h-5" />}
      title={msg.title}
      description={msg.description}
    />
  );
}

// ---------------------------------------------------------------------------
// Projekte Tab
// ---------------------------------------------------------------------------

function ProjekteTab({
  projekte,
  projektStats,
  allOrders,
  expandedIds,
  toggleExpand,
  selectionMode = false,
  selectedIds = new Set(),
  toggleSelect,
}: {
  projekte: ArchivedProjekt[];
  projektStats: Record<string, ProjektStats>;
  allOrders: PaidBestellung[];
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  toggleSelect?: (id: string) => void;
}) {
  if (projekte.length === 0) return <EmptyState type="projekte" />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {projekte.map((p) => {
        const stats = projektStats[p.id];
        const isExpanded = expandedIds.has(p.id);
        const projektOrders = allOrders.filter((o) => o.projekt_id === p.id);
        const budgetPercent =
          p.budget && stats ? Math.round((stats.volumen / p.budget) * 100) : null;

        return (
          <div
            key={p.id}
            className="card card-hover relative overflow-hidden"
            style={{ borderLeft: `4px solid ${p.farbe || "#9a9a9a"}` }}
          >
            <div
              className="absolute top-0 left-0 right-0 h-20 opacity-[0.04] pointer-events-none"
              style={{ background: `linear-gradient(180deg, ${p.farbe || "#9a9a9a"}, transparent)` }}
            />

            <div className="p-5 relative">
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  {selectionMode && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleSelect?.(p.id)}
                      className="w-4 h-4 mt-0.5 rounded border-line-strong text-brand focus:ring-brand/20 cursor-pointer shrink-0"
                    />
                  )}
                  <h3 className="font-headline text-base text-foreground leading-tight pr-2">{p.name}</h3>
                </div>
                <span className="inline-flex items-center gap-1 bg-success-bg border border-success-border text-success text-[10px] px-2 py-0.5 rounded font-semibold whitespace-nowrap uppercase tracking-wide">
                  Abgeschlossen
                </span>
              </div>

              {/* Description */}
              {p.beschreibung && (
                <p className="text-xs text-foreground-muted line-clamp-2 mb-3">{p.beschreibung}</p>
              )}

              {/* Stats row */}
              <div className="flex items-center gap-3 mb-3">
                {stats ? (
                  <>
                    <span className="text-xs text-foreground-muted">
                      {stats.count} Bestellung{stats.count !== 1 ? "en" : ""}
                    </span>
                    <div className="h-3 w-px bg-line" />
                    <span className="font-mono-amount text-sm font-semibold text-foreground">
                      {formatBetrag(stats.volumen)}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-foreground-faint">Keine bezahlten Bestellungen</span>
                )}
              </div>

              {/* Budget bar */}
              {budgetPercent !== null && p.budget && (
                <div className="mb-3 p-2.5 bg-input rounded-lg border border-line-subtle">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-foreground-subtle uppercase tracking-wider font-semibold">Budget</span>
                    <span className={`font-mono-amount text-[11px] font-medium ${
                      budgetPercent > 100 ? "text-error" : budgetPercent > 80 ? "text-warning" : "text-foreground-muted"
                    }`}>
                      {budgetPercent}% von {formatBetrag(p.budget)}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-line rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.min(100, budgetPercent)}%`,
                        backgroundColor:
                          budgetPercent > 100 ? "#dc2626" : budgetPercent > 80 ? "#d97706" : "#16a34a",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-foreground-faint">Erstellt {formatDatum(p.created_at)}</span>
                {projektOrders.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleExpand(p.id)}
                    className="flex items-center gap-1 text-xs text-brand hover:text-brand-light font-medium transition-colors"
                  >
                    <svg
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                    {isExpanded ? "Ausblenden" : `${projektOrders.length} Bestellung${projektOrders.length !== 1 ? "en" : ""}`}
                  </button>
                )}
              </div>

              {/* Expanded orders */}
              {isExpanded && projektOrders.length > 0 && (
                <div className="mt-3 pt-3 border-t border-line-subtle">
                  <div className="space-y-0">
                    {projektOrders.map((o, i) => (
                      <Link
                        key={o.id}
                        href={`/bestellungen/${o.id}`}
                        className={`group/row flex items-center justify-between py-2.5 px-2.5 -mx-0.5 rounded-lg hover:bg-line-subtle/60 transition-all ${
                          i < projektOrders.length - 1 ? "border-b border-canvas" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              o.bestellungsart === "subunternehmer"
                                ? "bg-warning"
                                : "bg-info"
                            }`}
                          />
                          <span className="font-mono-amount text-xs font-semibold text-foreground group-hover/row:text-brand transition-colors">
                            {o.bestellnummer || "Ohne Nr."}
                          </span>
                          <span className="text-xs text-foreground-muted truncate">{o.haendler_name || o.subunternehmer_firma || ""}</span>
                          {o.bestellungsart === "subunternehmer" && (
                            <span className="hidden sm:inline px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-warning-bg text-warning rounded">SU</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono-amount text-xs font-medium text-foreground">{formatBetrag(Number(o.betrag))}</span>
                          <span className="text-[10px] text-foreground-faint hidden sm:inline">{formatDatum(o.bezahlt_am)}</span>
                          <svg className="w-3 h-3 text-foreground-faint group-hover/row:text-brand transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Orders Tab (Material + SU) — table-based like Buchhaltung
// ---------------------------------------------------------------------------

function OrdersTab({
  orders,
  dokumenteMap,
  expandedIds,
  toggleExpand,
  type,
  limitReached,
  istAdmin,
  selectionMode = false,
  selectedIds = new Set(),
  toggleSelect,
  toggleGroupItems,
}: {
  orders: PaidBestellung[];
  dokumenteMap: Record<string, Dokument[]>;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  type: "material" | "subunternehmer";
  limitReached: boolean;
  istAdmin: boolean;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  toggleSelect?: (id: string) => void;
  toggleGroupItems?: (ids: string[]) => void;
}) {
  const monthGroups = useMemo(() => groupByMonth(orders, "bezahlt_am"), [orders]);
  const dokConfig = DOKUMENT_CONFIG[type];

  if (orders.length === 0) return <EmptyState type={type} />;

  return (
    <div className="space-y-6">
      {monthGroups.map((group) => (
        <div key={group.key}>
          {/* Month header — clean separator */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="font-headline text-sm text-foreground-muted">{group.label}</h3>
              <span className="text-[10px] text-foreground-faint">{group.items.length} Einträge</span>
            </div>
            <span className="font-mono-amount text-sm font-semibold text-foreground">
              {formatBetrag(group.subtotal)}
            </span>
          </div>

          {/* Table — consistent with Buchhaltung */}
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-input border-b border-line">
                  {selectionMode && (
                    <th className="px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        aria-label="Alle Einträge dieser Gruppe auswählen"
                        checked={group.items.length > 0 && group.items.every((o) => selectedIds.has(o.id))}
                        onChange={() => {
                          // F3.12: Single setState statt O(n) Render-Storm
                          toggleGroupItems?.(group.items.map((o) => o.id));
                        }}
                        className="w-4 h-4 rounded border-line-strong text-brand focus:ring-brand/20 cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 text-left font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase">Bestellnr.</th>
                  <th className="px-4 py-3 text-left font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase">
                    {type === "subunternehmer" ? "Firma" : "Händler"}
                  </th>
                  {istAdmin && (
                    <th className="px-4 py-3 text-left font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase hidden lg:table-cell">Besteller</th>
                  )}
                  <th className="px-4 py-3 text-left font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase hidden md:table-cell">Projekt</th>
                  {dokConfig.map((dok) => (
                    <th key={dok.flag} className="px-3 py-3 text-center font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase hidden sm:table-cell">{dok.kurzLabel}</th>
                  ))}
                  <th className="px-4 py-3 text-right font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase">Betrag</th>
                  <th className="px-4 py-3 text-left font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase">Bezahlt am</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((order, i) => {
                  const isExpanded = expandedIds.has(order.id);
                  const docs = dokumenteMap[order.id] || [];
                  return (
                    <OrderRow
                      key={order.id}
                      order={order}
                      docs={docs}
                      dokConfig={dokConfig}
                      isExpanded={isExpanded}
                      toggleExpand={toggleExpand}
                      type={type}
                      istAdmin={istAdmin}
                      isOdd={i % 2 === 1}
                      selectionMode={selectionMode}
                      isSelected={selectedIds.has(order.id)}
                      toggleSelect={toggleSelect}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Limit hint */}
      {limitReached && (
        <p className="text-foreground-subtle text-sm text-center py-4">
          Maximal 100 Einträge geladen. Ältere Einträge über die Suche finden.
        </p>
      )}

      {/* Sum footer */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground-subtle">
          {orders.length} archiviert
        </span>
        <span className="font-mono-amount font-semibold text-foreground">
          Summe: {formatBetrag(orders.reduce((sum, o) => sum + (Number(o.betrag) || 0), 0))}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order Row (expandable)
// ---------------------------------------------------------------------------

function OrderRow({
  order,
  docs,
  dokConfig,
  isExpanded,
  toggleExpand,
  type,
  istAdmin,
  isOdd,
  selectionMode = false,
  isSelected = false,
  toggleSelect,
}: {
  order: PaidBestellung;
  docs: Dokument[];
  dokConfig: typeof DOKUMENT_CONFIG.material;
  isExpanded: boolean;
  toggleExpand: (id: string) => void;
  type: "material" | "subunternehmer";
  istAdmin: boolean;
  isOdd: boolean;
  selectionMode?: boolean;
  isSelected?: boolean;
  toggleSelect?: (id: string) => void;
}) {
  return (
    <>
      <tr
        className={`table-row-hover border-b border-line-subtle ${isOdd ? "bg-zebra" : ""} ${isSelected ? "bg-brand/[0.03]" : ""}`}
        onClick={() => toggleExpand(order.id)}
      >
        {selectionMode && (
          <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelect?.(order.id)}
              className="w-4 h-4 rounded border-line-strong text-brand focus:ring-brand/20 cursor-pointer"
            />
          </td>
        )}
        <td className="px-4 py-3.5">
          <span className="font-mono-amount font-semibold text-brand">
            {order.bestellnummer || "–"}
          </span>
        </td>
        <td className="px-4 py-3.5 text-foreground">
          <span className="flex items-center gap-1.5">
            {type === "subunternehmer"
              ? order.subunternehmer_firma || order.haendler_name || "–"
              : order.haendler_name || "–"}
            {type === "subunternehmer" && order.subunternehmer_gewerk && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold tracking-wide bg-warning-bg text-warning rounded uppercase">{order.subunternehmer_gewerk}</span>
            )}
          </span>
        </td>
        {istAdmin && (
          <td className="px-4 py-3.5 text-foreground-muted hidden lg:table-cell">{order.besteller_name}</td>
        )}
        <td className="px-4 py-3.5 hidden md:table-cell">
          {order.projekt_name ? (
            <span className="text-xs text-foreground-muted">{order.projekt_name}</span>
          ) : (
            <span className="text-line-strong">–</span>
          )}
        </td>
        {dokConfig.map((dok) => {
          const hasDoc = order[dok.flag as keyof PaidBestellung] as boolean;
          return (
            <td key={dok.flag} className="px-3 py-3.5 text-center hidden sm:table-cell">
              {hasDoc ? (
                <svg className="w-4 h-4 text-success mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-line-strong mx-auto" />
              )}
            </td>
          );
        })}
        <td className="px-4 py-3.5 text-right">
          <span className="font-mono-amount font-semibold text-foreground">
            {formatBetrag(Number(order.betrag))}
          </span>
        </td>
        <td className="px-4 py-3.5">
          <div className="flex flex-col">
            <span className="text-[11px] text-foreground-muted">{formatDatum(order.bezahlt_am)}</span>
            {order.bezahlt_von && (
              <span className="text-[10px] text-foreground-faint">{order.bezahlt_von}</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3.5 text-center">
          <svg
            className={`w-4 h-4 text-foreground-faint transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </td>
      </tr>

      {/* Expanded row */}
      {isExpanded && (
        <tr>
          <td colSpan={20} className="p-0">
            <div className="bg-input border-b border-line px-6 py-4">
              <div className="flex items-start justify-between gap-6">
                {/* Documents */}
                <div className="flex-1">
                  <p className="text-[10px] text-foreground-subtle uppercase tracking-widest font-semibold mb-2">Dokumente</p>
                  {docs.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {docs.map((dok) => (
                        <div key={dok.id} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-line">
                          <svg className="w-3.5 h-3.5 text-foreground-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                          <span className="text-xs font-medium text-foreground capitalize">{dok.typ}</span>
                          {dok.gesamtbetrag != null && (
                            <span className="font-mono-amount text-[11px] text-foreground-muted">{formatBetrag(dok.gesamtbetrag)}</span>
                          )}
                          {dok.storage_pfad && (
                            <a
                              href={`/api/pdfs/${dok.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="p-0.5 rounded text-foreground-subtle hover:text-brand transition-colors"
                              title="PDF ansehen"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                              </svg>
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-foreground-faint">Keine Dokumente vorhanden</span>
                  )}
                </div>

                {/* Action */}
                <Link
                  href={`/bestellungen/${order.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-brand hover:text-brand-light font-medium border border-line rounded-lg hover:bg-white transition-colors shrink-0 group/link"
                >
                  Details
                  <svg className="w-3 h-3 transition-transform group-hover/link:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </Link>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
