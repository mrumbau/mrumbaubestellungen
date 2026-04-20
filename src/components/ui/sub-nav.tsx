"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * SubNav — horizontal secondary navigation for sectioned areas (e.g. /einstellungen).
 *
 * Why horizontal instead of a vertical sidebar?
 * - The main sidebar already consumes horizontal space.
 * - 7–9 sub-sections fit comfortably in a scroll-able horizontal rail.
 * - On mobile it gracefully degrades to a horizontal overflow-x scroller.
 *
 * a11y:
 * - `nav` with aria-label
 * - `aria-current="page"` on the active item (auto-detected via pathname exact or prefix)
 * - Focus-visible ring via the global --shadow-focus-ring token
 */
export type SubNavItem = {
  label: string;
  href: string;
  /**
   * Match mode. `exact` = active only on pathname === href (for overview/root items).
   * `prefix` = active on href and any deeper child. Default: `prefix`.
   */
  match?: "exact" | "prefix";
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  hidden?: boolean;
};

export function SubNav({
  items,
  ariaLabel,
  className,
}: {
  items: SubNavItem[];
  ariaLabel: string;
  className?: string;
}) {
  const pathname = usePathname();

  const isActive = (item: SubNavItem) => {
    if (!pathname) return false;
    if (item.match === "exact") return pathname === item.href;
    return pathname === item.href || pathname.startsWith(item.href + "/");
  };

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "-mx-1 overflow-x-auto scrollbar-hide",
        // Bottom border acts as the underline-rail against which active tabs attach
        "border-b border-line-subtle",
        className,
      )}
    >
      <ul className="flex min-w-max items-stretch gap-0 px-1">
        {items
          .filter((item) => !item.hidden)
          .map((item) => {
            const active = isActive(item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative inline-flex items-center gap-2 px-3 py-2.5 text-[13px] font-medium",
                    "transition-colors duration-150",
                    "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] rounded-t",
                    active
                      ? "text-foreground"
                      : "text-foreground-muted hover:text-foreground",
                  )}
                >
                  {item.icon && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "[&_svg]:h-4 [&_svg]:w-4",
                        active ? "text-brand" : "text-foreground-subtle group-hover:text-foreground-muted",
                      )}
                    >
                      {item.icon}
                    </span>
                  )}
                  <span>{item.label}</span>
                  {item.badge !== undefined && item.badge !== null && (
                    <span className="ml-0.5">{item.badge}</span>
                  )}
                  {/* Active underline — sits on the bottom border of the nav */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-x-2 bottom-[-1px] h-[2px] rounded-full",
                      active ? "bg-brand" : "bg-transparent",
                    )}
                  />
                </Link>
              </li>
            );
          })}
      </ul>
    </nav>
  );
}
