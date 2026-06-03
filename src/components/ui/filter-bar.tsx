/**
 * FilterBar — gemeinsamer Filter-Block für die großen Listen-Tabellen.
 *
 * Rendert:
 *   - Search-Input (mit ref für /-Shortcut)
 *   - Status-Select (Desktop only — Mobile-Filter wird separat darunter gerendert)
 *   - Projekt-Select (conditional — nur wenn Projekte-Liste nicht leer)
 *   - Reset-Button (conditional — nur wenn hasFilters)
 *
 * `children` ist Slot für rechts-anhängige Widgets (DensityToggle,
 * SavedViewsMenu, CSV-Export). Diese bleiben in der Konsumenten-Komponente
 * weil sie kontextabhängig sind (Selection-State, Saved-Views-Storage).
 *
 * Kompositionspartner: `useTableFilters`-Hook + `ArtTabs`-Komponente.
 */

import { type RefObject } from "react";
import { IconSearch, IconX } from "@/components/ui/icons";

export interface StatusOption {
  value: string;
  label: string;
}

export interface FilterBarProjekt {
  id: string;
  name: string;
}

export interface FilterBarProps {
  /** Aus useTableFilters extrahierte Werte + Setter */
  suche: string;
  onSucheChange: (next: string) => void;
  statusFilter: string;
  onStatusFilterChange: (next: string) => void;
  projektFilter: string;
  onProjektFilterChange: (next: string) => void;
  hasFilters: boolean;
  onReset: () => void;

  /** Verfügbare Status-Optionen für das Select */
  statusOptions: StatusOption[];
  /** Verfügbare Projekte für das Projekt-Select. Leer = Select ausgeblendet. */
  projekte?: FilterBarProjekt[];

  /** Ref für Programmatic-Focus (z.B. /-Shortcut) */
  searchInputRef?: RefObject<HTMLInputElement | null>;
  /** Optional Custom-Placeholder, default "Suchen… (Taste /)" */
  searchPlaceholder?: string;

  /** Slot für DensityToggle / SavedViewsMenu / Custom-Buttons rechts */
  children?: React.ReactNode;
}

const inputBase =
  "w-full pl-10 pr-4 py-2.5 bg-surface border border-line rounded-lg text-body-sm text-foreground placeholder-foreground-faint focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)] transition-colors";

// 12.05.2026 (Mobile-Sweep, F-MOB-NEU): vorher `hidden md:block` →
// Mobile-User konnte gar nicht filtern, nur suchen. Selects jetzt auf
// allen Viewports sichtbar, aber stacken via flex-col im Mobile-Layout.
const selectBase =
  "w-full sm:w-auto px-3.5 py-2.5 min-h-[44px] bg-surface border border-line rounded-lg text-body-sm text-foreground focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)] transition-colors";

export function FilterBar({
  suche, onSucheChange,
  statusFilter, onStatusFilterChange,
  projektFilter, onProjektFilterChange,
  hasFilters, onReset,
  statusOptions,
  projekte = [],
  searchInputRef,
  searchPlaceholder = "Suchen… (Taste /)",
  children,
}: FilterBarProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
      <div className="relative flex-1 min-w-0">
        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-subtle pointer-events-none" />
        <input
          ref={searchInputRef}
          type="text"
          value={suche}
          onChange={(e) => onSucheChange(e.target.value)}
          placeholder={searchPlaceholder}
          className={inputBase}
          aria-label="Suche in Bestellungen"
        />
      </div>

      <select
        value={statusFilter}
        onChange={(e) => onStatusFilterChange(e.target.value)}
        className={selectBase}
        aria-label="Status filtern"
      >
        {statusOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {projekte.length > 0 && (
        <select
          value={projektFilter}
          onChange={(e) => onProjektFilterChange(e.target.value)}
          className={selectBase}
          aria-label="Projekt filtern"
        >
          <option value="">Alle Projekte</option>
          {projekte.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}

      {hasFilters && (
        <button
          type="button"
          onClick={onReset}
          className="p-2.5 text-foreground-subtle hover:text-brand hover:bg-error-bg rounded-lg border border-line transition-colors shrink-0"
          title="Filter zurücksetzen"
          aria-label="Filter zurücksetzen"
        >
          <IconX className="w-4 h-4" />
        </button>
      )}

      {children}
    </div>
  );
}
