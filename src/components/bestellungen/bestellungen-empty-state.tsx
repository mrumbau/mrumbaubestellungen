"use client";

/**
 * BestellungenEmptyState — differenzierter Empty-State für die Bestellungen-Tabelle.
 * Aus bestellungen-tabelle.tsx extrahiert (12.05.2026, F3.3 Decomposition).
 *
 * Zwei Cases:
 *   - `totalCount === 0` → "Noch keine Bestellungen" mit Erklärung wie sie ankommen
 *   - Sonst (= Filter-Zero-Match) → "Keine Treffer" mit Pill-Liste der aktiven Filter
 *     + Reset-Button (UI-Audit F3.16)
 */

import { Button, EmptyState } from "@/components/ui";
import { IconSearch } from "@/components/ui/icons";
import type { FaelligkeitsFilter } from "@/lib/use-table-filters";
import type { ProjektOption } from "./types";

export interface BestellungenEmptyStateProps {
  totalCount: number;
  hasFilters: boolean;
  suche: string;
  statusFilter: string;
  artFilter: string;
  projektFilter: string;
  faelligkeitsFilter: FaelligkeitsFilter;
  projekte: ProjektOption[];
  onResetFilters: () => void;
}

export function BestellungenEmptyState({
  totalCount,
  hasFilters,
  suche,
  statusFilter,
  artFilter,
  projektFilter,
  faelligkeitsFilter,
  projekte,
  onResetFilters,
}: BestellungenEmptyStateProps) {
  if (totalCount === 0) {
    return (
      <EmptyState
        tone="info"
        compact
        icon={
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
        }
        title="Noch keine Bestellungen"
        description="Bestellungen erscheinen automatisch sobald eine Dokumenten-E-Mail bei info@ eingeht oder die Chrome-Extension eine Bestellbestätigung erkennt."
      />
    );
  }

  return (
    <EmptyState
      tone="info"
      compact
      icon={<IconSearch className="w-5 h-5" />}
      title="Keine Treffer"
      description={
        hasFilters ? (
          <>
            <span>Keine Bestellungen passen zu den aktuellen Filtern.</span>
            <span className="mt-2 flex flex-wrap gap-1.5">
              {suche && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] bg-canvas border border-line text-foreground-muted">
                  Suche: <span className="font-mono-amount text-foreground">„{suche}"</span>
                </span>
              )}
              {statusFilter && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] bg-canvas border border-line text-foreground-muted">
                  Status:{" "}
                  <span className="font-medium text-foreground">
                    {statusFilter === "offen"
                      ? "Offen (= alle außer freigegeben)"
                      : statusFilter}
                  </span>
                </span>
              )}
              {artFilter && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] bg-canvas border border-line text-foreground-muted">
                  Art: <span className="font-medium text-foreground">{artFilter}</span>
                </span>
              )}
              {projektFilter && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] bg-canvas border border-line text-foreground-muted">
                  Projekt:{" "}
                  <span className="font-medium text-foreground">
                    {projekte.find((p) => p.id === projektFilter)?.name ?? "—"}
                  </span>
                </span>
              )}
              {faelligkeitsFilter && faelligkeitsFilter !== "alle" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] bg-canvas border border-line text-foreground-muted">
                  Fälligkeit:{" "}
                  <span className="font-medium text-foreground">
                    {faelligkeitsFilter === "ueberfaellig"
                      ? "Überfällig"
                      : faelligkeitsFilter === "diese_woche"
                        ? "Diese Woche"
                        : faelligkeitsFilter}
                  </span>
                </span>
              )}
            </span>
          </>
        ) : (
          "Keine Bestellungen passen zu den aktuellen Filtern."
        )
      }
      primaryAction={
        hasFilters ? (
          <Button variant="secondary" size="sm" onClick={onResetFilters}>
            Alle Filter zurücksetzen
          </Button>
        ) : undefined
      }
    />
  );
}
