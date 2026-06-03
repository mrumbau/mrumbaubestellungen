/**
 * Projekte-Tab — Card-Grid mit Budget-Bar + Expanded-Orders.
 * Aus archiv-client.tsx extrahiert (11.05.2026).
 */

import Link from "next/link";
import { formatDatum, formatBetrag } from "@/lib/formatters";
import { displayBestellnummer } from "@/lib/bestellung-utils";
import { ArchivEmptyState } from "./archiv-empty-state";
import type { ArchivedProjekt, PaidBestellung, ProjektStats } from "./types";

export interface ProjekteTabProps {
  projekte: ArchivedProjekt[];
  projektStats: Record<string, ProjektStats>;
  allOrders: PaidBestellung[];
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  toggleSelect?: (id: string) => void;
}

export function ProjekteTab({
  projekte,
  projektStats,
  allOrders,
  expandedIds,
  toggleExpand,
  selectionMode = false,
  selectedIds = new Set(),
  toggleSelect,
}: ProjekteTabProps) {
  if (projekte.length === 0) return <ArchivEmptyState type="projekte" />;

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
                  <h3 className="font-headline text-body text-foreground leading-tight pr-2">{p.name}</h3>
                </div>
                <span className="inline-flex items-center gap-1 bg-success-bg border border-success-border text-success text-[10px] px-2 py-0.5 rounded font-semibold whitespace-nowrap uppercase tracking-wide">
                  Abgeschlossen
                </span>
              </div>

              {/* Description */}
              {p.beschreibung && (
                <p className="text-meta text-foreground-muted line-clamp-2 mb-3">{p.beschreibung}</p>
              )}

              {/* Stats row */}
              <div className="flex items-center gap-3 mb-3">
                {stats ? (
                  <>
                    <span className="text-meta text-foreground-muted">
                      {stats.count} Bestellung{stats.count !== 1 ? "en" : ""}
                    </span>
                    <div className="h-3 w-px bg-line" />
                    <span className="font-mono-amount text-body-sm font-semibold text-foreground">
                      {formatBetrag(stats.volumen)}
                    </span>
                  </>
                ) : (
                  <span className="text-meta text-foreground-faint">Keine bezahlten Bestellungen</span>
                )}
              </div>

              {/* Budget bar */}
              {budgetPercent !== null && p.budget && (
                <div className="mb-3 p-2.5 bg-input rounded-lg border border-line-subtle">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-foreground-subtle uppercase tracking-wider font-semibold">
                      Budget
                    </span>
                    <span
                      className={`font-mono-amount text-[12px] font-medium ${
                        budgetPercent > 100
                          ? "text-error"
                          : budgetPercent > 80
                            ? "text-warning"
                            : "text-foreground-muted"
                      }`}
                    >
                      {budgetPercent}% von {formatBetrag(p.budget)}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-line rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-[width,background-color] duration-700"
                      style={{
                        width: `${Math.min(100, budgetPercent)}%`,
                        backgroundColor:
                          budgetPercent > 100
                            ? "var(--feedback-error)"
                            : budgetPercent > 80
                              ? "var(--feedback-warning)"
                              : "var(--feedback-success)",
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
                    className="flex items-center gap-1 text-meta text-brand hover:text-brand-light font-medium transition-colors"
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
                    {isExpanded
                      ? "Ausblenden"
                      : `${projektOrders.length} Bestellung${projektOrders.length !== 1 ? "en" : ""}`}
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
                        prefetch={false}
                        className={`group/row flex items-center justify-between py-2.5 px-2.5 -mx-0.5 rounded-lg hover:bg-line-subtle/60 transition-colors ${
                          i < projektOrders.length - 1 ? "border-b border-canvas" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              o.bestellungsart === "subunternehmer" ? "bg-warning" : "bg-info"
                            }`}
                          />
                          <span className="font-mono-amount text-meta font-semibold text-foreground group-hover/row:text-brand transition-colors">
                            {displayBestellnummer(o)}
                          </span>
                          <span className="text-meta text-foreground-muted truncate">
                            {o.haendler_name || o.subunternehmer_firma || ""}
                          </span>
                          {o.bestellungsart === "subunternehmer" && (
                            <span className="hidden sm:inline px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-warning-bg text-warning rounded">
                              SU
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono-amount text-meta font-medium text-foreground">
                            {formatBetrag(Number(o.betrag))}
                          </span>
                          <span className="text-[10px] text-foreground-faint hidden sm:inline">
                            {formatDatum(o.bezahlt_am)}
                          </span>
                          <svg
                            className="w-3 h-3 text-foreground-faint group-hover/row:text-brand transition-colors"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
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
