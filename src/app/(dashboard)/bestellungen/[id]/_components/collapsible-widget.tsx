"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { IconChevronDown } from "@/components/ui/icons";

/**
 * CollapsibleWidget — sidebar accordion with at-most-one-open controller.
 *
 * The parent owns `openWidgetId` so opening one widget closes the others —
 * this keeps the sidebar at a predictable height and prevents the "wall of
 * accordions all open" anti-pattern on long sessions.
 *
 * Accessibility:
 * - `aria-expanded` on the trigger
 * - `aria-controls` points at the content region
 * - Content region has `role="region"` + `aria-labelledby`
 */
export function CollapsibleWidget({
  title,
  icon,
  defaultOpen = false,
  badge,
  children,
  widgetId,
  openWidgetId,
  onToggleWidget,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
  widgetId?: string;
  openWidgetId?: string | null;
  onToggleWidget?: (id: string) => void;
  className?: string;
}) {
  const [localOpen, setLocalOpen] = React.useState(defaultOpen);
  const isControlled = widgetId !== undefined && onToggleWidget !== undefined;
  const open = isControlled ? openWidgetId === widgetId : localOpen;

  const reactId = React.useId();
  const headerId = `${reactId}-header`;
  const contentId = `${reactId}-content`;

  function handleToggle() {
    if (isControlled) onToggleWidget!(widgetId!);
    else setLocalOpen(!localOpen);
  }

  return (
    <div className={cn("card overflow-hidden", className)}>
      <button
        type="button"
        id={headerId}
        onClick={handleToggle}
        aria-expanded={open}
        aria-controls={contentId}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3",
          "hover:bg-surface-hover transition-colors",
          "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <h3 className="font-headline text-[13px] tracking-tight text-foreground">{title}</h3>
          {badge}
        </div>
        <IconChevronDown
          className={cn(
            "h-4 w-4 text-foreground-subtle transition-transform duration-200",
            open ? "rotate-180" : "",
          )}
        />
      </button>
      {open && (
        <div
          role="region"
          id={contentId}
          aria-labelledby={headerId}
          className="px-4 pb-4 border-t border-line-subtle"
        >
          <div className="pt-3 max-h-[40vh] overflow-y-auto">{children}</div>
        </div>
      )}
    </div>
  );
}
