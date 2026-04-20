"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { IconX } from "./icons";

/**
 * BulkToolbar — Linear-style sticky selection toolbar.
 *
 * Renders null when `count === 0`. When count > 0, slides in sticky at the
 * top of its scroll container. Escape key clears the selection (via `onClear`).
 *
 * Compose action buttons as children — each list page provides its own
 * context-specific bulk actions (Freigeben, Archivieren, Exportieren, …).
 *
 * Accessibility:
 * - `role="toolbar"` with `aria-label`
 * - `aria-live="polite"` on the count so screen readers announce selection changes
 * - Escape handler scoped to window only while mounted
 */
export function BulkToolbar({
  count,
  label = "Einträge",
  onClear,
  children,
  className,
  closable = true,
  totalHint,
}: {
  count: number;
  /** Singular/plural root (e.g. "Bestellungen", "Rechnungen"). */
  label?: string;
  onClear: () => void;
  children?: React.ReactNode;
  className?: string;
  /** Allow Escape-key dismiss. Default true. */
  closable?: boolean;
  /** Optional "of X total" hint (e.g. "von 47 sichtbar"). */
  totalHint?: string;
}) {
  React.useEffect(() => {
    if (!closable || count === 0) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClear();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, closable, onClear]);

  if (count === 0) return null;

  return (
    <div
      role="toolbar"
      aria-label={`Bulk-Aktionen für ${count} ausgewählte ${label}`}
      className={cn(
        "sticky top-0 z-20",
        "flex items-center justify-between gap-3 px-4 py-2.5",
        "bg-foreground text-foreground-inverse rounded-lg shadow-[var(--shadow-elevated)]",
        "animate-scale-in",
        className,
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onClear}
          aria-label="Auswahl aufheben"
          className={cn(
            "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded",
            "text-foreground-inverse/80 hover:text-foreground-inverse hover:bg-white/10 transition-colors",
            "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
          )}
        >
          <IconX className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <p
            aria-live="polite"
            aria-atomic="true"
            className="text-[13px] font-semibold text-foreground-inverse leading-tight"
          >
            <span className="font-mono-amount">{count}</span>{" "}
            {count === 1 ? label.replace(/en$/, "") : label} ausgewählt
          </p>
          {totalHint && (
            <p className="text-[11px] text-foreground-inverse/60 leading-tight mt-0.5">
              {totalHint}
            </p>
          )}
        </div>
        <kbd
          aria-hidden="true"
          className="hidden md:inline-flex items-center gap-0.5 font-mono-amount text-[10px] text-foreground-inverse/60 ml-3"
          title="Drücke Escape um die Auswahl aufzuheben"
        >
          ESC
        </kbd>
      </div>
      {children && (
        <div className="flex items-center gap-2 shrink-0">{children}</div>
      )}
    </div>
  );
}
