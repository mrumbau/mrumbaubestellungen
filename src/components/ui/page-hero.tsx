import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { EditorialSection } from "./editorial-section";
import type { Breadcrumb } from "./page-header";

/**
 * PageHero — editoriale Variante von PageHeader für Hot-Path-Seiten
 * (Bestellungen, Bestelldetail, Dashboard, Buchhaltung, Archiv).
 *
 * Trägt das Brand-Versprechen von Login/Landing/404 ins Innere:
 *  - Display-Headline in `font-headline` (Barlow Condensed) clamp-skaliert
 *  - Eyebrow + Description bleiben kompatibel zu PageHeader
 *  - corner-marks subtle (nur tone="brand")
 *  - industrial-line als bottom-Separator (per Default an)
 *  - Optional film-grain für Hero-Statement-Sektionen
 *
 * Settings / System / Stammdaten nutzen weiter PageHeader (funktional,
 * unauffällig). Hot-Path-Seiten ziehen auf PageHero um.
 *
 * Niemals beide nebeneinander auf der gleichen Page. Eine Page hat
 * entweder PageHeader oder PageHero, nicht beides.
 */
export type PageHeroAction = React.ReactNode;

export function PageHero({
  title,
  description,
  eyebrow,
  breadcrumbs,
  actions,
  meta,
  tone = "brand",
  marks = true,
  grain = false,
  className,
  ariaLabel,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  breadcrumbs?: Breadcrumb[];
  actions?: PageHeroAction;
  meta?: React.ReactNode;
  /** brand = MR-Red corner-marks, neutral = ohne. Default brand. */
  tone?: "brand" | "neutral";
  /** corner-marks an Card-Ecken zeigen. Default true bei tone=brand. */
  marks?: boolean;
  /** Film-Grain-Overlay. Default false. Anschalten für Brand-Statement-Heros (z.B. Dashboard). */
  grain?: false | "subtle" | "light";
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <EditorialSection
      as="header"
      tone={tone}
      marks={marks}
      lineBottom
      grain={grain}
      padding="relaxed"
      className={className}
      ariaLabel={ariaLabel}
    >
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-4">
          <ol className="flex items-center gap-1.5 text-meta text-foreground-subtle">
            {breadcrumbs.map((crumb, i) => {
              const isLast = i === breadcrumbs.length - 1;
              return (
                <li key={i} className="flex items-center gap-1.5">
                  {crumb.href && !isLast ? (
                    <Link
                      href={crumb.href}
                      className={cn(
                        "transition-colors hover:text-foreground",
                        "rounded focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
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

      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="mb-2 text-eyebrow font-semibold uppercase tracking-[0.18em] text-foreground-subtle">
              {eyebrow}
            </div>
          )}
          <h1
            className={cn(
              "font-headline text-display-section text-foreground",
              "tracking-tight",
            )}
          >
            {title}
          </h1>
          {description && (
            <p className="mt-3 max-w-2xl text-body-sm leading-relaxed text-foreground-muted">
              {description}
            </p>
          )}
          {meta && <div className="mt-4 flex flex-wrap items-center gap-3">{meta}</div>}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div>
        )}
      </div>
    </EditorialSection>
  );
}
