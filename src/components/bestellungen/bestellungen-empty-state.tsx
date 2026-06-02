"use client";

/**
 * BestellungenEmptyState — differenzierter Empty-State für die Bestellungen-Tabelle.
 * Aus bestellungen-tabelle.tsx extrahiert (12.05.2026, F3.3 Decomposition).
 *
 * Zwei Cases:
 *   - `totalCount === 0` → "Noch keine Bestellungen" mit Erklärung wie sie ankommen
 *   - Sonst (= Filter-Zero-Match) → "Keine Treffer" mit Pill-Liste der aktiven Filter
 *     + Reset-Button (UI-Audit F3.16)
 *
 * 02.06.2026 (UX-Polish gegen Filter-Konflikt):
 *   - Jede Filter-Pill ist jetzt removable (X-Icon) wenn der entsprechende
 *     Setter durchgereicht wurde. So kann der User PRÄZISE den einen Filter
 *     entfernen, der den Konflikt erzeugt — statt mit der Brechstange "Alle
 *     Filter zurücksetzen" auch funktionierende Filter wegzunehmen.
 *   - Wenn der Scope ein widersprüchliches Filter-Setup erzwingt (z.B.
 *     "Meine erledigt" + Status "Offen"), wird der präzise CTA als Primary
 *     gerendert ("Status-Filter aufheben") und der generische Reset wandert
 *     zur Secondary-Action.
 */

import { Button, EmptyState } from "@/components/ui";
import { IconSearch, IconX } from "@/components/ui/icons";
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
  /**
   * 02.06.2026 — Per-Filter-Clear (optional). Wenn durchgereicht, bekommt die
   * jeweilige Pill ein kleines X-Icon. Wenn weggelassen, ist die Pill rein
   * informativ wie bisher (Backward-Compat).
   */
  onClearSuche?: () => void;
  onClearStatus?: () => void;
  onClearArt?: () => void;
  onClearProjekt?: () => void;
  onClearFaelligkeit?: () => void;
  /**
   * Aktueller Scope-Tab. Wenn "mine-done" und der einzige aktive Filter ein
   * Status-Filter ist (außer "" / "freigegeben"), schalten wir den Status-
   * Clear auf Primary-CTA — das ist der häufigste Konflikt-Fall.
   */
  scope?: "pool" | "mine-open" | "mine-done" | "all";
}

function FilterPill({
  label,
  value,
  mono,
  onClear,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  onClear?: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] bg-canvas border border-line text-foreground-muted">
      <span>{label}:</span>
      <span className={`font-medium text-foreground${mono ? " font-mono-amount" : ""}`}>{value}</span>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="ml-0.5 inline-flex items-center justify-center w-4 h-4 -mr-0.5 rounded-sm text-foreground-faint hover:text-error hover:bg-error-bg transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          aria-label={`${label} entfernen`}
          title={`${label} entfernen`}
        >
          <IconX className="w-3 h-3" />
        </button>
      )}
    </span>
  );
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
  onClearSuche,
  onClearStatus,
  onClearArt,
  onClearProjekt,
  onClearFaelligkeit,
  scope,
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
        description="Bestellungen erscheinen automatisch sobald eine Dokumenten-E-Mail bei info@ eingeht."
      />
    );
  }

  // 02.06.2026 — Konflikt-Detektion: bei "Meine erledigt" filtert der Server
  // schon auf status=freigegeben. Wenn der Client-Status auf etwas Konflikt-
  // erzeugendes steht (Default "offen" wäre der häufigste Fall, aber auch
  // andere wie "abweichung" landen unter "freigegeben" eh nie), bieten wir
  // den präzisen Status-Clear als Primary-CTA.
  const statusKonfliktMitScope =
    scope === "mine-done" && statusFilter !== "" && statusFilter !== "freigegeben";

  return (
    <EmptyState
      tone="info"
      compact
      icon={<IconSearch className="w-5 h-5" />}
      title="Keine Treffer"
      description={
        hasFilters ? (
          <>
            <span>
              {statusKonfliktMitScope
                ? "Der Tab „Meine erledigt“ zeigt freigegebene Bestellungen, dein Status-Filter steht aber auf etwas anderes. Beides zusammen passt nicht."
                : "Keine Bestellungen passen zu den aktuellen Filtern."}
            </span>
            <span className="mt-2 flex flex-wrap gap-1.5">
              {suche && (
                <FilterPill label="Suche" value={`„${suche}“`} mono onClear={onClearSuche} />
              )}
              {statusFilter && (
                <FilterPill
                  label="Status"
                  value={
                    statusFilter === "offen"
                      ? "Offen (= alle außer freigegeben)"
                      : statusFilter
                  }
                  onClear={onClearStatus}
                />
              )}
              {artFilter && (
                <FilterPill label="Art" value={artFilter} onClear={onClearArt} />
              )}
              {projektFilter && (
                <FilterPill
                  label="Projekt"
                  value={projekte.find((p) => p.id === projektFilter)?.name ?? "—"}
                  onClear={onClearProjekt}
                />
              )}
              {faelligkeitsFilter && faelligkeitsFilter !== "alle" && (
                <FilterPill
                  label="Fälligkeit"
                  value={
                    faelligkeitsFilter === "ueberfaellig"
                      ? "Überfällig"
                      : faelligkeitsFilter === "diese_woche"
                        ? "Diese Woche"
                        : faelligkeitsFilter
                  }
                  onClear={onClearFaelligkeit}
                />
              )}
            </span>
          </>
        ) : (
          "Keine Bestellungen passen zu den aktuellen Filtern."
        )
      }
      primaryAction={
        statusKonfliktMitScope && onClearStatus ? (
          <Button variant="primary" size="sm" onClick={onClearStatus}>
            Status-Filter aufheben
          </Button>
        ) : hasFilters ? (
          <Button variant="secondary" size="sm" onClick={onResetFilters}>
            Alle Filter zurücksetzen
          </Button>
        ) : undefined
      }
      secondaryAction={
        statusKonfliktMitScope && hasFilters ? (
          <Button variant="ghost" size="sm" onClick={onResetFilters}>
            Alle Filter zurücksetzen
          </Button>
        ) : undefined
      }
    />
  );
}
