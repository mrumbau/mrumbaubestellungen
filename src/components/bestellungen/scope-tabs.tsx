/**
 * ScopeTabs — Top-Level-Tab-Switcher für die Bestellungen-Liste (Pool-Phase-2).
 *
 * Vier Scope-Buckets über alle Bestellungen:
 *   - **Pool** — UNBEKANNT-Material (für alle Besteller sichtbar, Phase-1 RLS).
 *   - **Meine offen** — eigene + Abo/SU, status ≠ freigegeben.
 *   - **Meine erledigt** — eigene + Abo/SU, status = freigegeben.
 *   - **Alle** — admin-only (kompletter Datenbestand).
 *
 * URL-State via `?view=pool|mine-open|mine-done|all`. Reines Link-Pattern,
 * keine Client-Interaktivität — Server-Page liest den Param und scoped die
 * Query. Bookmarkable + shareable. ArtTabs (Material/SU/Abo) bleiben als
 * **Sub-Layer** darunter, kontextuell ausgeblendet in `mine-done` weil dort
 * Filter doppelt redundant wären.
 *
 * Pattern aus ArtTabs übernommen — gleiche Pill-Höhe, gleiche Active-Behandlung.
 * Brand-Disziplin: KEINE neuen Farben, nur Reuse der existing Tokens
 * (bg-canvas-Container, bg-surface-active, bg-brand-Counter-Pill).
 *
 * 02.06.2026 (Pool Phase 2).
 */

import Link from "next/link";

export type PoolScope = "pool" | "mine-open" | "mine-done" | "all";

export interface PoolScopeTab {
  key: PoolScope;
  label: string;
  count: number;
  /** Hide wenn der aktuelle User diesen Tab nicht haben darf (z.B. `all` für Besteller). */
  hidden?: boolean;
}

export interface ScopeTabsProps {
  active: PoolScope;
  tabs: PoolScopeTab[];
  /** Aktuelle Query-Params (außer view) damit Tab-Switch andere Filter beibehält. */
  preservedSearchParams?: Record<string, string | undefined>;
}

function buildHref(view: PoolScope, preserved?: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  params.set("view", view);
  if (preserved) {
    for (const [k, v] of Object.entries(preserved)) {
      if (v && k !== "view") params.set(k, v);
    }
  }
  return `/bestellungen?${params.toString()}`;
}

export function ScopeTabs({ active, tabs, preservedSearchParams }: ScopeTabsProps) {
  const visible = tabs.filter((t) => !t.hidden);
  return (
    <nav
      className="flex items-end gap-6 border-b border-line-subtle overflow-x-auto -mx-1 px-1"
      role="tablist"
      aria-label="Bestellungs-Sichten"
    >
      {visible.map((tab) => {
        const isActive = active === tab.key;
        return (
          <Link
            key={tab.key}
            href={buildHref(tab.key, preservedSearchParams)}
            role="tab"
            aria-selected={isActive}
            prefetch={false}
            // Primary-Tab-Style (02.06.2026 UI-Polish): underline-style statt
            // pill-container. Setzt klare Hierarchie über die Secondary-ArtTabs
            // darunter und folgt dem editorial-Pattern aus Linear / GitHub.
            className={`relative flex items-center gap-2 pb-3 pt-1 text-[15px] font-medium whitespace-nowrap transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] rounded-t-sm ${
              isActive
                ? "text-foreground"
                : "text-foreground-muted hover:text-foreground"
            }`}
          >
            <span>{tab.label}</span>
            {tab.count > 0 && (
              <span
                className={`inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 text-[10px] font-bold rounded-full font-mono-amount tabular-nums transition-colors ${
                  isActive
                    ? "bg-brand text-foreground-inverse"
                    : "bg-canvas text-foreground-muted"
                }`}
                aria-label={`${tab.count} Bestellungen`}
              >
                {tab.count}
              </span>
            )}
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute -bottom-px left-0 right-0 h-[2px] bg-brand rounded-t"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
