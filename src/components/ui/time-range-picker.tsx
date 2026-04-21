"use client";

import { cn } from "@/lib/cn";

/**
 * TimeRangePicker — Pill-Segmented-Control für Dashboard-Zeitraum-Filter.
 *
 * Steuert welchen Zeitraum das Dashboard "nachschaut" (Volumen-Widget,
 * KI-Zusammenfassung, MoM-Delta). Stats + Confirm-Queue + Mahnungen bleiben
 * Current-State, weil sie "was gibt's gerade" sind — Zeitraum-Filter wäre dort irreführend.
 *
 * Segmented-Control gewählt gegenüber Dropdown: aktueller Wert ist immer
 * sichtbar, keine zusätzlichen Klicks für Wechsel. Mehr Desktop-Platz, aber
 * der Picker sitzt eh in der Settings-Row — Klarheit > Kompaktheit.
 */
export type TimeRange = "7d" | "30d" | "90d" | "month" | "prev-month";

export const TIME_RANGE_OPTIONS: { value: TimeRange; label: string; ariaLabel: string }[] = [
  { value: "7d", label: "7 T", ariaLabel: "Letzte 7 Tage" },
  { value: "30d", label: "30 T", ariaLabel: "Letzte 30 Tage" },
  { value: "90d", label: "90 T", ariaLabel: "Letzte 90 Tage" },
  { value: "month", label: "Monat", ariaLabel: "Aktueller Monat" },
  { value: "prev-month", label: "Vormonat", ariaLabel: "Vormonat" },
];

export function TimeRangePicker({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Zeitraum"
      className="inline-flex bg-input border border-line rounded-lg p-0.5"
    >
      {TIME_RANGE_OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.ariaLabel}
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-2.5 h-6 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap",
              "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
              active
                ? "bg-surface text-foreground shadow-card"
                : "text-foreground-subtle hover:text-foreground-muted",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
