"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { IconChevronDown } from "./icons";

/**
 * DataTable — enterprise tabular primitive.
 *
 * Designed to absorb the four major list views (bestellungen, archiv, kunden,
 * projekte). Stop 1 scope: column API, density toggle, controlled selection,
 * controlled sort, sticky header, empty/loading states, zebra rows,
 * per-row class hook, responsive column hiding.
 *
 * Stop 2 will extend with: shift/cmd range selection, bulk toolbar,
 * keyboard navigation (j/k arrows, Enter, Space, Cmd+A, /, Escape).
 *
 * Deliberately NOT in scope here: virtualization (we don't yet have lists
 * large enough for it — 200-500 rows the norm), drag-and-drop column reorder,
 * resizable columns, inline editing.
 *
 * Accessibility:
 * - `<table>` with semantic `<thead>` / `<tbody>` / `<tr>` / `<th scope="col">`
 * - Sortable headers use `aria-sort` and `<button>` inside `<th>`
 * - Selection checkboxes have per-row `aria-label` (customisable)
 * - Sticky header is a visual affordance, not a11y-hostile (rows remain
 *   semantically ordered)
 */

// ─── Types ──────────────────────────────────────────────────────────────

export type SortDirection = "asc" | "desc";
export type SortState = { key: string; direction: SortDirection } | null;
export type Density = "compact" | "comfortable" | "spacious";

export type DataTableColumn<TRow> = {
  /** Stable key — used for sort state, React keys, and aria. */
  key: string;
  /** Column header label. */
  label: React.ReactNode;
  /** Custom cell renderer. Defaults to `(row as any)[key]`. */
  render?: (row: TRow, index: number) => React.ReactNode;
  /** Enable sort-on-header-click. Requires caller to respond to `onSortChange`. */
  sortable?: boolean;
  /** Text-align. Numeric columns: `"right"`. */
  align?: "left" | "right" | "center";
  /** Extra cell classes (e.g. `font-mono-amount`, `truncate`). */
  className?: string;
  /** Extra header-cell classes. */
  headerClassName?: string;
  /** Fixed width (number = px, string = any CSS value). */
  width?: number | string;
  /**
   * Hide this column below a breakpoint. Useful for secondary info on mobile.
   * Example: `"md"` hides below 768px.
   */
  hideBelow?: "sm" | "md" | "lg" | "xl";
  /**
   * Prevent the row `onRowClick` from firing when clicking inside this cell
   * (e.g. for cells that contain their own buttons/links).
   */
  stopPropagation?: boolean;
};

export type DataTableProps<TRow> = {
  columns: DataTableColumn<TRow>[];
  data: TRow[];
  getRowId: (row: TRow) => string;

  /**
   * Required accessible name for the table. Announced by screen readers,
   * kept out of the visual DOM via `<caption class="sr-only">`.
   */
  ariaLabel: string;

  /** Controlled density. Pair with `useTableDensity()` for localStorage persistence. */
  density?: Density;

  /**
   * Controlled selection. Pass a Set to enable the checkbox column.
   * Omit entirely to hide selection UI.
   */
  selection?: Set<string>;
  onSelectionChange?: (selection: Set<string>) => void;
  /** Factory for per-row aria-label on the selection checkbox. */
  getSelectionAriaLabel?: (row: TRow) => string;

  /** Controlled sort. */
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;

  /** Row click (drill-down). Receives the event so callers can decide on metaKey etc. */
  onRowClick?: (row: TRow, event: React.MouseEvent<HTMLTableRowElement>) => void;

  /** Per-row class hook (e.g. add `bg-error-bg/40` for rows with issues). */
  getRowClassName?: (row: TRow, index: number) => string;

  /** Rendered when `!loading && data.length === 0`. */
  emptyState?: React.ReactNode;

  /** Renders `skeletonRows` placeholder rows instead of `data`. */
  loading?: boolean;
  skeletonRows?: number;

  className?: string;
  tableClassName?: string;
};

// ─── Variants ───────────────────────────────────────────────────────────

const headerCellVariants = cva(
  "text-[10px] font-semibold uppercase tracking-widest text-foreground-subtle whitespace-nowrap",
  {
    variants: {
      density: {
        compact: "px-3 py-1.5",
        comfortable: "px-4 py-2.5",
        spacious: "px-4 py-3.5",
      },
      align: {
        left: "text-left",
        right: "text-right",
        center: "text-center",
      },
    },
    defaultVariants: { density: "comfortable", align: "left" },
  },
);

const bodyCellVariants = cva("text-foreground align-middle", {
  variants: {
    density: {
      compact: "px-3 py-1.5 text-[12px]",
      comfortable: "px-4 py-2.5 text-[13px]",
      spacious: "px-4 py-3.5 text-[14px]",
    },
    align: {
      left: "text-left",
      right: "text-right",
      center: "text-center",
    },
  },
  defaultVariants: { density: "comfortable", align: "left" },
});

const rowVariants = cva(
  "table-row-hover border-b border-line-subtle transition-colors",
  {
    variants: {
      /** Zebra stripe applied to odd rows (based on index passed at runtime). */
      zebra: { true: "bg-zebra", false: "" },
      /** Row is selected — translucent brand tint overrides zebra. */
      selected: { true: "bg-brand/[0.04] hover:bg-brand/[0.06]", false: "" },
      /** Caller opted into drill-down on row click. */
      clickable: { true: "cursor-pointer group", false: "" },
    },
    compoundVariants: [
      // Selection colour should win over zebra regardless of index parity.
      { zebra: true, selected: true, class: "bg-brand/[0.04]" },
    ],
    defaultVariants: { zebra: false, selected: false, clickable: false },
  },
);

const hideBelowMap: Record<NonNullable<DataTableColumn<unknown>["hideBelow"]>, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

// ─── Main component ─────────────────────────────────────────────────────

export function DataTable<TRow>({
  columns,
  data,
  getRowId,
  ariaLabel,
  density = "comfortable",
  selection,
  onSelectionChange,
  getSelectionAriaLabel,
  sort,
  onSortChange,
  onRowClick,
  getRowClassName,
  emptyState,
  loading = false,
  skeletonRows = 8,
  className,
  tableClassName,
}: DataTableProps<TRow>) {
  const selectionEnabled = selection !== undefined;
  const allSelectableIds = React.useMemo(() => data.map((r) => getRowId(r)), [data, getRowId]);
  const allSelected =
    selectionEnabled &&
    data.length > 0 &&
    allSelectableIds.every((id) => selection.has(id));
  const someSelected =
    selectionEnabled && !allSelected && allSelectableIds.some((id) => selection.has(id));

  // Keyboard navigation state
  const tbodyRef = React.useRef<HTMLTableSectionElement>(null);
  const [focusedRowId, setFocusedRowId] = React.useState<string | null>(null);
  // Anchor for shift-click / shift-arrow range selection
  const [lastToggledIndex, setLastToggledIndex] = React.useState<number | null>(null);

  // If the focused row disappears (after filter/sort/delete), drop the focus.
  React.useEffect(() => {
    if (focusedRowId && !allSelectableIds.includes(focusedRowId)) {
      setFocusedRowId(null);
    }
  }, [focusedRowId, allSelectableIds]);

  const focusRow = React.useCallback((id: string | null) => {
    setFocusedRowId(id);
    if (id === null) return;
    requestAnimationFrame(() => {
      // CSS.escape handles UUIDs, IDs with `:`/`.`/`[`/`]` etc.
      // Fallback to attribute-equals if CSS.escape is unavailable (very old browsers).
      const selector =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? `tr[data-row-id="${CSS.escape(id)}"]`
          : `tr[data-row-id="${id.replace(/"/g, '\\"')}"]`;
      const el = tbodyRef.current?.querySelector(selector);
      if (el instanceof HTMLElement) el.focus();
    });
  }, []);

  const handleHeaderCheckbox = () => {
    if (!selectionEnabled || !onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(allSelectableIds));
    }
  };

  // Select a contiguous range of rows [start..end] (inclusive).
  const selectRange = React.useCallback(
    (fromIdx: number, toIdx: number) => {
      if (!selectionEnabled || !onSelectionChange) return;
      const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
      const next = new Set(selection);
      for (let i = lo; i <= hi && i < data.length; i++) {
        next.add(getRowId(data[i]));
      }
      onSelectionChange(next);
    },
    [data, getRowId, onSelectionChange, selection, selectionEnabled],
  );

  const toggleRowAtIndex = React.useCallback(
    (index: number, withShiftKey: boolean) => {
      if (!selectionEnabled || !onSelectionChange) return;
      if (index < 0 || index >= data.length) return;

      if (withShiftKey && lastToggledIndex !== null) {
        selectRange(lastToggledIndex, index);
        return;
      }
      const id = getRowId(data[index]);
      const next = new Set(selection);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onSelectionChange(next);
      setLastToggledIndex(index);
    },
    [data, getRowId, lastToggledIndex, onSelectionChange, selectRange, selection, selectionEnabled],
  );

  const handleHeaderSort = (col: DataTableColumn<TRow>) => {
    if (!col.sortable || !onSortChange) return;
    if (sort?.key !== col.key) {
      onSortChange({ key: col.key, direction: "asc" });
      return;
    }
    if (sort.direction === "asc") {
      onSortChange({ key: col.key, direction: "desc" });
      return;
    }
    // asc → desc → cleared
    onSortChange(null);
  };

  const handleRowKeyDown = (
    e: React.KeyboardEvent<HTMLTableRowElement>,
    row: TRow,
    index: number,
  ) => {
    switch (e.key) {
      case "ArrowDown":
      case "j": {
        e.preventDefault();
        const nextIndex = Math.min(index + 1, data.length - 1);
        if (nextIndex !== index) {
          const nextId = getRowId(data[nextIndex]);
          focusRow(nextId);
          if (e.shiftKey && selectionEnabled && lastToggledIndex !== null) {
            selectRange(lastToggledIndex, nextIndex);
          }
        }
        break;
      }
      case "ArrowUp":
      case "k": {
        e.preventDefault();
        const prevIndex = Math.max(index - 1, 0);
        if (prevIndex !== index) {
          const prevId = getRowId(data[prevIndex]);
          focusRow(prevId);
          if (e.shiftKey && selectionEnabled && lastToggledIndex !== null) {
            selectRange(lastToggledIndex, prevIndex);
          }
        }
        break;
      }
      case "Home":
        if (data.length > 0) {
          e.preventDefault();
          focusRow(getRowId(data[0]));
        }
        break;
      case "End":
        if (data.length > 0) {
          e.preventDefault();
          focusRow(getRowId(data[data.length - 1]));
        }
        break;
      case "Enter":
        if (onRowClick) {
          e.preventDefault();
          // Synthesise a mouse-like event by casting; downstream doesn't read
          // mouse-specific fields, just receives the underlying event.
          onRowClick(row, e as unknown as React.MouseEvent<HTMLTableRowElement>);
        }
        break;
      case " ":
        if (selectionEnabled) {
          e.preventDefault();
          toggleRowAtIndex(index, e.shiftKey);
        }
        break;
      case "a":
      case "A":
        if ((e.metaKey || e.ctrlKey) && selectionEnabled && onSelectionChange) {
          e.preventDefault();
          onSelectionChange(new Set(allSelectableIds));
        }
        break;
      case "Escape":
        if (selectionEnabled && onSelectionChange && selection.size > 0) {
          e.preventDefault();
          onSelectionChange(new Set());
          setLastToggledIndex(null);
        }
        break;
    }
  };

  const colSpanCount = columns.length + (selectionEnabled ? 1 : 0);

  return (
    <div className={cn("card overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table
          className={cn("w-full", tableClassName)}
          role="table"
          aria-rowcount={data.length}
        >
          <caption className="sr-only">{ariaLabel}</caption>

          <thead className="sticky top-0 z-10 bg-input">
            <tr className="border-b border-line">
              {selectionEnabled && (
                <th scope="col" className={cn(headerCellVariants({ density }), "w-10")}>
                  <CheckboxCell
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={handleHeaderCheckbox}
                    disabled={!onSelectionChange || data.length === 0}
                    ariaLabel={
                      allSelected
                        ? "Alle abwählen"
                        : `Alle ${data.length} Zeilen auswählen`
                    }
                  />
                </th>
              )}
              {columns.map((col) => {
                const alignedLabel = (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      col.align === "right" && "flex-row-reverse",
                    )}
                  >
                    {col.label}
                    {col.sortable && <SortIndicator active={sort?.key === col.key} direction={sort?.key === col.key ? sort?.direction : undefined} />}
                  </span>
                );

                const ariaSort: React.AriaAttributes["aria-sort"] =
                  col.sortable
                    ? sort?.key === col.key
                      ? sort?.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                    : undefined;

                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={ariaSort}
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                      headerCellVariants({ density, align: col.align }),
                      col.hideBelow && hideBelowMap[col.hideBelow],
                      col.headerClassName,
                    )}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => handleHeaderSort(col)}
                        className={cn(
                          "inline-flex items-center gap-1",
                          col.align === "right" && "flex-row-reverse",
                          "hover:text-foreground transition-colors",
                          "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] rounded",
                        )}
                      >
                        {alignedLabel}
                      </button>
                    ) : (
                      alignedLabel
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody ref={tbodyRef}>
            {loading ? (
              <SkeletonBody
                rowCount={skeletonRows}
                density={density}
                selectionEnabled={selectionEnabled}
                columns={columns}
              />
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={colSpanCount} className="px-4 py-16">
                  {emptyState ?? (
                    <div className="text-center text-[13px] text-foreground-subtle">
                      Keine Daten.
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              data.map((row, i) => {
                const id = getRowId(row);
                const isSelected = selectionEnabled && selection.has(id);
                const extraClass = getRowClassName?.(row, i) ?? "";
                // Roving tabindex: the focused row gets tabIndex 0, the rest -1.
                // If no row is focused yet, the first row receives focus when the
                // table is tabbed into.
                const isFocusCandidate =
                  focusedRowId === id || (focusedRowId === null && i === 0);
                return (
                  <tr
                    key={id}
                    data-row-id={id}
                    data-selected={isSelected || undefined}
                    aria-selected={selectionEnabled ? isSelected : undefined}
                    tabIndex={isFocusCandidate ? 0 : -1}
                    onClick={(e) => onRowClick?.(row, e)}
                    onKeyDown={(e) => handleRowKeyDown(e, row, i)}
                    onFocus={() => setFocusedRowId(id)}
                    className={cn(
                      rowVariants({
                        zebra: i % 2 === 1,
                        selected: isSelected,
                        clickable: !!onRowClick,
                      }),
                      extraClass,
                      // Focus-visible ring on the row — styled as left inset bar
                      // so it doesn't collide with the table-row-hover inset-border.
                      "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:relative focus-visible:z-[1]",
                    )}
                  >
                    {selectionEnabled && (
                      <td
                        className={cn(bodyCellVariants({ density }), "w-10")}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <CheckboxCell
                          checked={isSelected}
                          onToggle={(withShift) => toggleRowAtIndex(i, withShift)}
                          disabled={!onSelectionChange}
                          ariaLabel={
                            getSelectionAriaLabel?.(row) ?? `Zeile auswählen`
                          }
                        />
                      </td>
                    )}
                    {columns.map((col) => {
                      const content = col.render
                        ? col.render(row, i)
                        : (row as Record<string, React.ReactNode>)[col.key] ?? "–";
                      return (
                        <td
                          key={col.key}
                          onClick={col.stopPropagation ? (e) => e.stopPropagation() : undefined}
                          className={cn(
                            bodyCellVariants({ density, align: col.align }),
                            col.hideBelow && hideBelowMap[col.hideBelow],
                            col.className,
                          )}
                        >
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

/**
 * CheckboxCell — either:
 *   - `onToggle(withShift)` for row-level checkboxes (shift-click range support), OR
 *   - `onChange()` for simple toggle (header checkbox, no modifier detection needed)
 *
 * Only one of the two handlers is used per call-site.
 */
function CheckboxCell({
  checked,
  indeterminate = false,
  onChange,
  onToggle,
  disabled = false,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange?: () => void;
  onToggle?: (withShift: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={ariaLabel}
      checked={checked}
      onChange={() => onChange?.()}
      onClick={(e) => {
        if (onToggle) {
          e.preventDefault();
          e.stopPropagation();
          onToggle(e.shiftKey);
        }
      }}
      disabled={disabled}
      className={cn(
        "w-4 h-4 rounded border border-line-strong bg-surface cursor-pointer",
        "text-brand accent-[var(--mr-red)]",
        "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    />
  );
}

function SortIndicator({
  active,
  direction,
}: {
  active: boolean;
  direction?: SortDirection;
}) {
  if (!active) {
    return (
      <IconChevronDown
        aria-hidden="true"
        className="h-3 w-3 text-foreground-subtle/40 opacity-0 group-hover:opacity-100"
      />
    );
  }
  return (
    <IconChevronDown
      aria-hidden="true"
      className={cn(
        "h-3 w-3 text-brand transition-transform",
        direction === "asc" ? "rotate-180" : "rotate-0",
      )}
    />
  );
}

function SkeletonBody<TRow>({
  rowCount,
  density,
  selectionEnabled,
  columns,
}: {
  rowCount: number;
  density: Density;
  selectionEnabled: boolean;
  columns: DataTableColumn<TRow>[];
}) {
  return (
    <>
      {Array.from({ length: rowCount }).map((_, i) => (
        <tr key={i} className="border-b border-line-subtle">
          {selectionEnabled && (
            <td className={cn(bodyCellVariants({ density }), "w-10")}>
              <div className="h-4 w-4 rounded skeleton" />
            </td>
          )}
          {columns.map((col) => (
            <td
              key={col.key}
              className={cn(
                bodyCellVariants({ density, align: col.align }),
                col.hideBelow && hideBelowMap[col.hideBelow],
              )}
            >
              <div
                className={cn(
                  "h-3 skeleton-text rounded",
                  col.align === "right" ? "ml-auto" : "",
                )}
                style={{ width: `${40 + ((i * 7 + col.key.length) % 50)}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Density toggle + persistence hook ──────────────────────────────────

const densityToggleVariants = cva(
  "inline-flex bg-input border border-line rounded-md p-0.5",
);

const densityButtonVariants = cva(
  "px-2 h-7 text-[11px] font-semibold rounded transition-colors " +
    "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
  {
    variants: {
      active: {
        true: "bg-surface text-foreground shadow-card",
        false: "text-foreground-subtle hover:text-foreground-muted",
      },
    },
    defaultVariants: { active: false },
  },
);

const densityIcons: Record<Density, React.ReactNode> = {
  compact: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
      <path d="M3 4.5h10M3 7.5h10M3 10.5h10" strokeLinecap="round" />
    </svg>
  ),
  comfortable: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
      <path d="M3 4h10M3 8h10M3 12h10" strokeLinecap="round" />
    </svg>
  ),
  spacious: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
      <path d="M3 3.5h10M3 8h10M3 12.5h10" strokeLinecap="round" />
    </svg>
  ),
};

const densityLabels: Record<Density, string> = {
  compact: "Kompakt",
  comfortable: "Standard",
  spacious: "Geräumig",
};

export function DensityToggle({
  density,
  onChange,
  className,
}: {
  density: Density;
  onChange: (d: Density) => void;
  className?: string;
}) {
  const order: Density[] = ["compact", "comfortable", "spacious"];
  return (
    <div
      role="radiogroup"
      aria-label="Zeilendichte"
      className={cn(densityToggleVariants(), className)}
    >
      {order.map((d) => {
        const active = density === d;
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={densityLabels[d]}
            title={densityLabels[d]}
            onClick={() => onChange(d)}
            className={densityButtonVariants({ active })}
          >
            {densityIcons[d]}
          </button>
        );
      })}
    </div>
  );
}

export type DensityToggleVariants = VariantProps<typeof densityButtonVariants>;

/**
 * useTableDensity — localStorage-persisted density state.
 *
 * `storageKey` should be unique per table (e.g. `"bestellungen.density"`)
 * so one user can have different densities per list view.
 */
export function useTableDensity(
  storageKey: string,
  initial: Density = "comfortable",
): [Density, (d: Density) => void] {
  const [density, setDensityState] = React.useState<Density>(initial);

  // Load from localStorage on mount (client-only to avoid SSR mismatch)
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "compact" || stored === "comfortable" || stored === "spacious") {
        setDensityState(stored);
      }
    } catch {
      /* storage blocked */
    }
  }, [storageKey]);

  const setDensity = React.useCallback(
    (d: Density) => {
      setDensityState(d);
      try {
        window.localStorage.setItem(storageKey, d);
      } catch {
        /* storage blocked */
      }
    },
    [storageKey],
  );

  return [density, setDensity];
}
