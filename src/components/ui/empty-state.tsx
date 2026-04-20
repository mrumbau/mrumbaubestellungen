import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * EmptyState — actionable, never "dead end".
 *
 * Two common variants:
 * - tone="info"    → "Noch keine Daten" (show primary action to create/import)
 * - tone="success" → "Alles erledigt" (optional secondary action to navigate on)
 *
 * Always pair icon + title + description + at least one action when possible.
 * Anti-pattern: silent empty states that leave the user wondering what's next.
 */
type EmptyStateTone = "info" | "success" | "error";

const toneClasses: Record<EmptyStateTone, string> = {
  info: "bg-canvas border-line text-foreground-muted",
  success: "bg-success-bg border-success-border text-success",
  error: "bg-error-bg border-error-border text-error",
};

export function EmptyState({
  tone = "info",
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  compact = false,
  className,
}: {
  tone?: EmptyStateTone;
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center rounded-lg border border-dashed",
        toneClasses[tone],
        compact ? "px-4 py-8 gap-2" : "px-6 py-14 gap-3",
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            "flex items-center justify-center rounded-lg",
            compact ? "h-8 w-8" : "h-10 w-10",
            tone === "info" ? "bg-surface border border-line text-foreground-muted" : "",
            tone === "success" ? "bg-white/60 text-success" : "",
            tone === "error" ? "bg-white/60 text-error" : "",
          )}
        >
          {icon}
        </div>
      )}
      <div className="max-w-sm">
        <h3
          className={cn(
            "font-semibold text-foreground",
            compact ? "text-sm" : "text-[15px]",
          )}
        >
          {title}
        </h3>
        {description && (
          <p
            className={cn(
              "mt-1 text-foreground-muted",
              compact ? "text-[12px]" : "text-[13px] leading-relaxed",
            )}
          >
            {description}
          </p>
        )}
      </div>
      {(primaryAction || secondaryAction) && (
        <div className="flex items-center gap-2 pt-1">
          {primaryAction}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
