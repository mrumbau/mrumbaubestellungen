"use client";

/**
 * ArchivClient — Top-Level-Orchestrator für /archiv.
 *
 * Block-4-Decomposition (11.05.2026): von 1119 LOC monolith reduziert auf
 * Orchestrierung + State-Hooks. Sub-Komponenten in src/components/archiv/,
 * pure-Helpers in src/lib/archiv-utils.ts (mit Vitest-Coverage).
 */

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ActiveFilterPills, BulkToolbar, Button, type ActiveFilterPill } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { PageHero } from "@/components/ui/page-hero";
import { IconTrash } from "@/components/ui/icons";
import {
  groupByMonth as _groupByMonth, // re-import to keep tree-shaking happy in IDEs
  matchesSearchOrder,
  matchesSearchProjekt,
  inDateRange,
} from "@/lib/archiv-utils";
import { ArchivStatsCards } from "@/components/archiv/archiv-stats-cards";
import { ArchivToolbar } from "@/components/archiv/archiv-toolbar";
import { ProjekteTab } from "@/components/archiv/projekte-tab";
import { OrdersTab } from "@/components/archiv/orders-tab";
import type {
  ArchivedProjekt,
  Dokument,
  PaidBestellung,
  ProjektStats,
  TabKey,
} from "@/components/archiv/types";

// Suppress unused-import warning — kept for IDE auto-import discoverability
void _groupByMonth;

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

  const hasFilters = Boolean(searchQuery || dateFrom || dateTo);

  const resetFilters = () => {
    setSearchQuery("");
    setDateFrom("");
    setDateTo("");
  };

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
            }),
          ),
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
    } catch {
      /* silent */
    } finally {
      setDeleteLoading(false);
    }
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
          }),
        ),
      );
      if (results.every((r) => r.ok)) {
        setLocalProjekte((prev) => prev.filter((p) => !selectedIds.has(p.id)));
        setSelectedIds(new Set());
        setSelectionMode(false);
        setShowReactivateDialog(false);
        router.refresh();
      }
    } catch {
      /* silent */
    } finally {
      setReactivateLoading(false);
    }
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
    <div className="space-y-6">
      <PageHero
        eyebrow="Historie"
        title="Archiv"
        description="Abgeschlossene Projekte, alte Bestellungen, Statistiken über Zeit."
        tone="brand"
        marks
      />

      {/* Summary Stats */}
      <ArchivStatsCards summary={summary} />

      {/* Industrial-Line zwischen Stats-Snapshot und Toolbar+Content.
          12.05.2026 (DESIGN-Critique #6). */}
      <div className="industrial-line" aria-hidden="true" />

      {/* Tabs + Search + Date + Selection-Mode + CSV */}
      <ArchivToolbar
        activeTab={activeTab}
        tabCounts={tabCounts}
        onTabChange={(next) => {
          setActiveTab(next);
          setExpandedIds(new Set());
          exitSelectionMode();
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        hasFilters={hasFilters}
        onResetFilters={resetFilters}
        selectionMode={selectionMode}
        onEnterSelectionMode={() => setSelectionMode(true)}
        filteredMaterial={filteredMaterial}
        filteredSU={filteredSU}
        selectedIds={selectedIds}
      />

      {/* 03.06.2026 (Phase 4 Polish): Active-Filter-Pills — one-glance auf
          aktive Suche / Datum. Render direkt unter Toolbar, vor Tab-Content. */}
      {hasFilters && (
        <div className="mt-3">
          <ActiveFilterPills
            pills={(() => {
              const pills: ActiveFilterPill[] = [];
              if (searchQuery) {
                pills.push({
                  key: "suche",
                  label: "Suche",
                  value: `„${searchQuery}“`,
                  mono: true,
                  onClear: () => setSearchQuery(""),
                });
              }
              if (dateFrom) {
                pills.push({
                  key: "datumVon",
                  label: "Ab",
                  value: dateFrom,
                  onClear: () => setDateFrom(""),
                });
              }
              if (dateTo) {
                pills.push({
                  key: "datumBis",
                  label: "Bis",
                  value: dateTo,
                  onClear: () => setDateTo(""),
                });
              }
              return pills;
            })()}
            onResetAll={resetFilters}
          />
        </div>
      )}

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

      {/* Bulk Toolbar — sticky, appears when selection > 0 */}
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
      <Modal
        open={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeleteLoading(false);
        }}
        size="sm"
        title={activeTab === "projekte" ? "Projekte löschen" : "Archivierte Einträge löschen"}
        variant="destructive"
        footer={(
          <>
            <Button
              variant="secondary"
              data-modal-cancel
              onClick={() => {
                setShowDeleteDialog(false);
                setDeleteLoading(false);
              }}
              disabled={deleteLoading}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              loading={deleteLoading}
            >
              {deleteLoading ? "Lösche..." : "Endgültig löschen"}
            </Button>
          </>
        )}
      >
        <p className="text-body-sm text-foreground-muted">
          {activeTab === "projekte"
            ? `${selectedIds.size} ${selectedIds.size === 1 ? "Projekt" : "Projekte"} endgültig archivieren? Die zugehörigen Bestellungen bleiben erhalten.`
            : `${selectedIds.size} ${selectedIds.size === 1 ? "Eintrag" : "Einträge"} und alle zugehörigen Dokumente unwiderruflich löschen?`}
        </p>
      </Modal>

      {/* Confirm Reactivate Dialog */}
      <Modal
        open={showReactivateDialog}
        onClose={() => {
          setShowReactivateDialog(false);
          setReactivateLoading(false);
        }}
        size="sm"
        title="Projekte reaktivieren"
        variant="default"
        footer={(
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setShowReactivateDialog(false);
                setReactivateLoading(false);
              }}
              disabled={reactivateLoading}
            >
              Abbrechen
            </Button>
            <Button
              variant="primary"
              onClick={handleBulkReactivate}
              loading={reactivateLoading}
              autoFocus
            >
              {reactivateLoading ? "..." : "Reaktivieren"}
            </Button>
          </>
        )}
      >
        <p className="text-body-sm text-foreground-muted">
          {`${selectedIds.size} ${selectedIds.size === 1 ? "Projekt" : "Projekte"} wieder auf „Aktiv" setzen?`}
        </p>
      </Modal>
    </div>
  );
}
