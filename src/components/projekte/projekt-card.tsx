"use client";

/**
 * ProjektCard — Card für aktive Projekte mit Stats, Budget-Bar, Status-Dropdown.
 * Aus projekte-client.tsx extrahiert (12.05.2026, F6.2 Sprint 2).
 */

import Link from "next/link";
import { formatBetrag, formatDatum } from "@/lib/formatters";
import { StatusDropdown, StatusIcon, getStatusCfg } from "./status-dropdown";
import type { Projekt, ProjektStats } from "./types";

export interface ProjektCardProps {
  projekt: Projekt;
  stats: ProjektStats;
  budgetPercent: number | null;
  istAdmin: boolean;
  statusUpdating: string | null;
  onStatusChange: (id: string, status: string) => void;
  onEdit: (projekt: Projekt) => void;
}

function getBudgetColor(percent: number): string {
  if (percent > 100) return "var(--feedback-error)";
  if (percent > 80) return "var(--feedback-warning)";
  return "var(--feedback-success)";
}

export function ProjektCard({
  projekt: p,
  stats: s,
  budgetPercent,
  istAdmin,
  statusUpdating,
  onStatusChange,
  onEdit,
}: ProjektCardProps) {
  return (
    <div
      className="card card-hover relative overflow-hidden"
      style={{ borderLeft: `4px solid ${p.farbe}` }}
    >
      {/* Gradient overlay */}
      <div
        className="absolute top-0 left-0 right-0 h-20 opacity-[0.04] pointer-events-none"
        style={{ background: `linear-gradient(180deg, ${p.farbe}, transparent)` }}
      />

      <div className="p-5 relative">
        {/* Header */}
        <div className="flex items-start justify-between mb-1">
          <div className="min-w-0 flex-1">
            <h3 className="font-headline text-body text-foreground truncate">{p.name}</h3>
          </div>
          <div className="flex items-center gap-1.5 ml-2 shrink-0">
            {istAdmin ? (
              <>
                <StatusDropdown
                  currentStatus={p.status}
                  onSelect={(s) => onStatusChange(p.id, s)}
                  disabled={statusUpdating === p.id}
                />
                <button
                  onClick={() => onEdit(p)}
                  className="p-1 rounded hover:bg-canvas transition-colors text-foreground-faint hover:text-brand"
                  title="Bearbeiten"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
              </>
            ) : (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border ${getStatusCfg(p.status).bg} ${getStatusCfg(p.status).text} ${getStatusCfg(p.status).border}`}
              >
                <StatusIcon type={getStatusCfg(p.status).icon} className="w-2.5 h-2.5" />
                {getStatusCfg(p.status).label}
              </span>
            )}
          </div>
        </div>

        {/* Kunde */}
        {p.kunde && (
          <p className="text-[12px] text-foreground-subtle mt-0.5 truncate">{p.kunde}</p>
        )}

        {/* Description */}
        {p.beschreibung && (
          <p className="text-meta text-foreground-muted line-clamp-2 mb-3">{p.beschreibung}</p>
        )}

        {/* Stats — structured grid */}
        <div className="grid grid-cols-3 gap-2 mt-3 p-3 bg-input rounded-lg border border-line-subtle">
          <div>
            <p className="text-[10px] text-foreground-subtle uppercase tracking-wider font-semibold">
              Bestell.
            </p>
            <p className="font-mono-amount text-body-sm font-semibold text-foreground mt-0.5">
              {s.gesamt}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-foreground-subtle uppercase tracking-wider font-semibold">
              Volumen
            </p>
            <p className="font-mono-amount text-body-sm font-semibold text-foreground mt-0.5">
              {formatBetrag(s.volumen)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-foreground-subtle uppercase tracking-wider font-semibold">
              Offen
            </p>
            <p
              className={`font-mono-amount text-body-sm font-semibold mt-0.5 ${s.offen > 0 ? "text-brand" : "text-foreground-faint"}`}
            >
              {s.offen}
            </p>
          </div>
        </div>

        {/* Budget Bar */}
        {budgetPercent !== null && p.budget && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-foreground-subtle uppercase tracking-wider font-semibold">
                Budget
              </span>
              <span className="font-mono-amount text-foreground-muted">
                {formatBetrag(s.volumen)} / {formatBetrag(p.budget)}
              </span>
            </div>
            <div className="h-1.5 bg-line rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-[width,background] duration-700"
                style={{
                  width: `${budgetPercent}%`,
                  background: getBudgetColor(budgetPercent),
                }}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-line-subtle flex items-center justify-between">
          <span className="text-[10px] text-foreground-faint">{formatDatum(p.created_at)}</span>
          <Link
            href={`/bestellungen?projekt_id=${p.id}`}
            className="inline-flex items-center gap-1 text-meta text-brand hover:text-brand-light font-medium transition-colors group/link"
          >
            Bestellungen
            <svg
              className="w-3 h-3 transition-transform group-hover/link:translate-x-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
