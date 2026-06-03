"use client";

/**
 * ActiveFilterPills — always-on Filter-Status-Strip oberhalb von Listen.
 *
 * 03.06.2026 (Phase 4 Polish): vorher waren die Filter-Pills nur im
 * EmptyState-Zero-Match-Fall sichtbar. Bei nicht-leeren Trefferlisten gab es
 * keinen one-glance-Hinweis, was gerade filtert. Effekt auf Mobile: User
 * tippt "warum sehe ich nur 3 Treffer", weiß aber nicht dass Status="Offen"
 * noch aktiv ist von letzter Session.
 *
 * Diese Komponente rendert die aktiven Filter als removable Pills direkt
 * oberhalb der Tabelle — gleicher visueller Sprache wie der EmptyState-
 * Variant, aber kontinuierlich sichtbar. Renders null wenn keine Pills.
 *
 * Konsumiert in:
 *   - bestellungen-tabelle.tsx
 *   - archiv-client.tsx via archiv-toolbar (auf separate Position)
 */

import * as React from "react";
import { IconX } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export interface ActiveFilterPill {
  key: string;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  onClear?: () => void;
}

export function ActiveFilterPills({
  pills,
  onResetAll,
  resetLabel = "Alle zurücksetzen",
  className,
}: {
  pills: ActiveFilterPill[];
  onResetAll?: () => void;
  resetLabel?: string;
  className?: string;
}) {
  const visible = pills.filter((p) => p != null);
  if (visible.length === 0) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 text-[12px]",
        className,
      )}
      role="group"
      aria-label="Aktive Filter"
    >
      <span className="text-foreground-faint mr-0.5">Filter:</span>
      {visible.map((p) => (
        <span
          key={p.key}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-canvas border border-line text-foreground-muted"
        >
          <span>{p.label}:</span>
          <span className={`font-medium text-foreground${p.mono ? " font-mono-amount" : ""}`}>
            {p.value}
          </span>
          {p.onClear && (
            <button
              type="button"
              onClick={p.onClear}
              className="ml-0.5 inline-flex items-center justify-center w-4 h-4 -mr-0.5 rounded-sm text-foreground-faint hover:text-error hover:bg-error-bg transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
              aria-label={`${p.label} entfernen`}
              title={`${p.label} entfernen`}
            >
              <IconX className="w-3 h-3" />
            </button>
          )}
        </span>
      ))}
      {onResetAll && visible.length > 1 && (
        <button
          type="button"
          onClick={onResetAll}
          className="ml-1 inline-flex items-center gap-1 text-foreground-subtle hover:text-brand transition-colors underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] rounded px-1"
        >
          {resetLabel}
        </button>
      )}
    </div>
  );
}
