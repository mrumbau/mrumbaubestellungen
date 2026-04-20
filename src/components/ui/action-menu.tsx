"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { IconDotsHorizontal } from "./icons";

/**
 * ActionMenu — compact row-action trigger (⋯) with keyboard-accessible popover.
 *
 * Replaces rows of visible action icons. One trigger per row keeps tables
 * scannable; power users open the menu with Enter/Space, navigate with arrows,
 * confirm with Enter, dismiss with Escape. Click-outside also closes.
 *
 * Positioning: right-aligned below trigger (default). Pure CSS — no portal.
 * The popover is `absolute` inside a `relative` wrapper, so the parent row's
 * `overflow:hidden` (rare in tables) will clip; this is intentional, not a bug.
 *
 * Accessibility:
 *   - Trigger:  type=button, aria-haspopup=menu, aria-expanded
 *   - Menu:     role=menu
 *   - Items:    role=menuitem + tabIndex -1 + roving focus via arrow keys
 *   - Focus returns to trigger when the menu closes (Escape or after click)
 */
export type ActionMenuItem = {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** Renders the item in semantic-red with darker error-bg hover. */
  destructive?: boolean;
  /** Optional short description shown right-aligned (e.g. shortcut). */
  hint?: string;
};

export function ActionMenu({
  items,
  label = "Aktionen",
  align = "end",
  buttonClassName,
  disabled = false,
}: {
  items: ActionMenuItem[];
  /** aria-label for the trigger button. Shown to screen readers only. */
  label?: string;
  /** Popover horizontal alignment relative to trigger. */
  align?: "start" | "end";
  buttonClassName?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState<number>(-1);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const enabledIndexes = React.useMemo(
    () => items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0),
    [items],
  );

  // Close on outside click or Escape (when open)
  React.useEffect(() => {
    if (!open) return;
    function handleDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handleDocClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDocClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // When opening: move focus to first enabled item
  React.useEffect(() => {
    if (!open) {
      setActiveIndex(-1);
      return;
    }
    const first = enabledIndexes[0];
    if (first != null) {
      setActiveIndex(first);
      // Defer focus until after render
      queueMicrotask(() => itemRefs.current[first]?.focus());
    }
  }, [open, enabledIndexes]);

  function moveActive(dir: 1 | -1) {
    if (enabledIndexes.length === 0) return;
    const currentPos = enabledIndexes.indexOf(activeIndex);
    const nextPos =
      currentPos < 0
        ? dir === 1
          ? 0
          : enabledIndexes.length - 1
        : (currentPos + dir + enabledIndexes.length) % enabledIndexes.length;
    const next = enabledIndexes[nextPos];
    setActiveIndex(next);
    itemRefs.current[next]?.focus();
  }

  function handleItemKey(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      const first = enabledIndexes[0];
      if (first != null) {
        setActiveIndex(first);
        itemRefs.current[first]?.focus();
      }
    } else if (e.key === "End") {
      e.preventDefault();
      const last = enabledIndexes[enabledIndexes.length - 1];
      if (last != null) {
        setActiveIndex(last);
        itemRefs.current[last]?.focus();
      }
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const item = items[index];
      if (!item.disabled) {
        selectItem(item);
      }
    }
  }

  function selectItem(item: ActionMenuItem) {
    setOpen(false);
    triggerRef.current?.focus();
    // Call onSelect after state update so the row stays in a valid focus state
    queueMicrotask(() => item.onSelect());
  }

  function handleTriggerKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  }

  return (
    <div className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={handleTriggerKey}
        className={cn(
          "inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors",
          "text-foreground-subtle hover:text-foreground hover:bg-canvas",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
          buttonClassName,
        )}
      >
        <IconDotsHorizontal className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "absolute top-full mt-1 z-40",
            "min-w-[180px] py-1 rounded-md",
            "bg-surface border border-line shadow-[var(--shadow-elevated)]",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item, i) => (
            <button
              key={i}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={activeIndex === i ? 0 : -1}
              disabled={item.disabled}
              onClick={(e) => {
                e.stopPropagation();
                selectItem(item);
              }}
              onKeyDown={(e) => handleItemKey(e, i)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] text-left",
                "transition-colors",
                "focus-visible:outline-none",
                item.disabled
                  ? "text-foreground-faint cursor-not-allowed"
                  : item.destructive
                    ? "text-error hover:bg-error-bg focus:bg-error-bg"
                    : "text-foreground hover:bg-canvas focus:bg-canvas",
              )}
            >
              {item.icon && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "inline-flex h-4 w-4 items-center justify-center shrink-0",
                    "[&_svg]:h-3.5 [&_svg]:w-3.5",
                  )}
                >
                  {item.icon}
                </span>
              )}
              <span className="flex-1">{item.label}</span>
              {item.hint && (
                <span className="text-[10px] text-foreground-subtle font-mono-amount shrink-0">
                  {item.hint}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
