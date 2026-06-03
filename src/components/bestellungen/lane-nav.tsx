/**
 * LaneNav — Posteingang-Navigation für /bestellungen (UX-R2, 03.06.2026).
 *
 * Drei Lanes statt der alten 4 Owner-Tabs. Underline-Style + sub-label
 * (`13 warten` / `48 offen` / `137 Einträge`) statt nackter Counts. Magnetic-
 * Hover (transform:translateY(-1px) auf Hover). Aktive Lane bekommt die
 * Brand-Underline.
 *
 * Behält das Linear/GitHub-Underline-Pattern aus den alten ScopeTabs, aber:
 *  - Sub-Label macht die Lane-Semantik explizit ("warten" vs "offen" vs "Einträge")
 *  - Cmd+K-Search-Trigger sitzt rechts (Foundation, modal kommt später)
 *  - Counts sind im Sub-Label, nicht als Pill — reduziert Pill-Inflation
 *  - Niemals "Alle" als Lane — Admin sieht alle in der In-Arbeit-Tabelle
 *    mit Owner-Spalte; Cmd+K ist der cross-Lane-Search-Modus.
 *
 * Aktive Lane wird via `usePathname()` ermittelt — Layout muss sie nicht
 * durchreichen.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LANE_COPY, LANES, type Lane } from "./lane-config";
import { cn } from "@/lib/cn";

function laneFromPathname(pathname: string): Lane {
  if (pathname.includes("/bestellungen/in-arbeit")) return "in-arbeit";
  if (pathname.includes("/bestellungen/archiv")) return "archiv";
  return "pool";
}

export interface LaneNavProps {
  counts: Record<Lane, number>;
  /** Optional: Query-Params die beim Lane-Switch erhalten bleiben. */
  preservedSearchParams?: Record<string, string | undefined>;
}

function buildHref(lane: Lane, preserved?: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  if (preserved) {
    for (const [k, v] of Object.entries(preserved)) {
      if (v) params.set(k, v);
    }
  }
  const qs = params.toString();
  return `/bestellungen/${lane}${qs ? `?${qs}` : ""}`;
}

export function LaneNav({ counts, preservedSearchParams }: LaneNavProps) {
  const pathname = usePathname();
  const active = laneFromPathname(pathname || "");
  return (
    <nav
      className="flex items-end gap-8 border-b border-line-subtle overflow-x-auto -mx-1 px-1"
      role="tablist"
      aria-label="Bestellungs-Lanes"
    >
      {LANES.map((lane) => {
        const isActive = active === lane;
        const copy = LANE_COPY[lane];
        const count = counts[lane] ?? 0;
        return (
          <Link
            key={lane}
            href={buildHref(lane, preservedSearchParams)}
            role="tab"
            aria-selected={isActive}
            prefetch={false}
            className={cn(
              "relative flex flex-col items-start gap-0.5 pb-3 pt-1 whitespace-nowrap",
              "transition-[color,transform] duration-150 ease-out",
              "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] rounded-t-sm",
              "hover:-translate-y-px",
              isActive
                ? "text-foreground"
                : "text-foreground-muted hover:text-foreground",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="font-headline text-h2 leading-none">
                {copy.label}
              </span>
              <span
                className={cn(
                  "font-mono-amount tabular-nums text-meta",
                  isActive ? "text-foreground" : "text-foreground-subtle",
                )}
                aria-label={`${count} Einträge`}
              >
                {count}
              </span>
            </div>
            <span
              className={cn(
                "text-eyebrow uppercase tracking-[0.14em]",
                isActive ? "text-foreground-muted" : "text-foreground-faint",
              )}
            >
              {copy.subLabelFor(count)}
            </span>
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
