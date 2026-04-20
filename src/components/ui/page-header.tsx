import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * PageHeader — sits at the top of every page below the sidebar/main-content boundary.
 *
 * Visual contract (industrial MR):
 * - Thin breadcrumb above
 * - Display-font title (Barlow Condensed) + optional overline eyebrow
 * - Right-aligned primary/secondary action slot
 * - `industrial-line` separator below (from globals.css)
 *
 * Never wrap this in another card — it's the page's structural header.
 */
export type Breadcrumb = {
  label: string;
  href?: string;
};

export function PageHeader({
  title,
  description,
  eyebrow,
  breadcrumbs,
  actions,
  meta,
  className,
  separator = true,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
  separator?: boolean;
}) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="flex items-center gap-1.5 text-[12px] text-foreground-subtle">
            {breadcrumbs.map((crumb, i) => {
              const isLast = i === breadcrumbs.length - 1;
              return (
                <li key={i} className="flex items-center gap-1.5">
                  {crumb.href && !isLast ? (
                    <Link
                      href={crumb.href}
                      className={cn(
                        "hover:text-foreground transition-colors",
                        "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] rounded",
                      )}
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      aria-current={isLast ? "page" : undefined}
                      className={cn(isLast ? "text-foreground-muted" : "")}
                    >
                      {crumb.label}
                    </span>
                  )}
                  {!isLast && (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 12 12"
                      className="h-2.5 w-2.5 text-foreground-subtle/60"
                    >
                      <path
                        d="M4.5 3l3 3-3 3"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-foreground-subtle mb-1">
              {eyebrow}
            </div>
          )}
          <h1 className="font-headline text-[26px] leading-tight tracking-tight text-foreground md:text-[28px]">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-foreground-muted">
              {description}
            </p>
          )}
          {meta && <div className="mt-2.5 flex items-center gap-3 flex-wrap">{meta}</div>}
        </div>
        {actions && <div className="shrink-0 flex items-center gap-2 pt-1">{actions}</div>}
      </div>

      {separator && <div className="industrial-line mt-1" aria-hidden="true" />}
    </header>
  );
}
