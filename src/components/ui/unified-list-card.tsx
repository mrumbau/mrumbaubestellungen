/**
 * UnifiedListCard — Card-Sediment-Lösung (UX-R4)
 * -----------------------------------------------------------------
 * Vor UX-R4 hat jede Liste in der App ihre eigene Card-Surface
 * gebaut: Pool-Inbox-Cards, Projekte-/Kunden-Cards und DataTable-Rows
 * hatten alle abweichendes Padding, Gap, Shadow, Border-Radius und
 * Hover-Verhalten. Dieses "Card-Sediment" hat die Listen visuell
 * unruhig gemacht — drei verschiedene Variants für gefuehlt gleiche
 * Aufgaben.
 *
 * UnifiedListCard standardisiert die Surface ueber drei klar
 * getrennte Use-Cases:
 *
 *  - **vendor-strip**  — Pool-Inbox-Cards (Editorial, Magnetic-Lift,
 *                        rounded-lg, voller Card-Charakter).
 *  - **title-strip**   — Stammdaten-Listen (Projekte, Kunden,
 *                        Vendoren). Sanfter, ohne Lift, da dichter.
 *  - **table-row**     — DataTable-Rows. Minimal, ohne Border,
 *                        nur Hover-Tint — DataTable hat eigene
 *                        Trennlinien.
 *
 * Active-, Deferred- und Wash-States sind variant-übergreifend
 * harmonisiert. Wash überschreibt das background-color (z.B.
 * bg-aging-stale für überfällige Bestellungen).
 *
 * Siehe DESIGN.md → UX-R4 Card-Sediment-Lösung.
 */

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

import { cn } from "@/lib/cn";

export type UnifiedListCardVariant = "vendor-strip" | "title-strip" | "table-row";

export interface UnifiedListCardProps {
  variant: UnifiedListCardVariant;
  /** Wenn gesetzt: rendert als next/link <a> mit prefetch=false. Sonst <article>. */
  href?: string;
  onClick?: (e: MouseEvent) => void;
  /** Selected/aktiver State (z.B. ausgewaehlte Row in Master-Detail). */
  isActive?: boolean;
  /** Dimmed (Pool-spezifisch — Defer-State). */
  isDeferred?: boolean;
  /** Optionaler Background-Wash-Class (z.B. bg-aging-stale). Ueberschreibt bg-surface. */
  wash?: string | null;
  className?: string;
  children: ReactNode;
  ariaLabel?: string;
}

const BASE_VARIANT: Record<UnifiedListCardVariant, string> = {
  "vendor-strip":
    "rounded-lg border border-line bg-surface overflow-hidden " +
    "transition-[transform,box-shadow,background-color] duration-150 ease-out " +
    "hover:shadow-card hover:border-line-strong hover:-translate-y-px",
  "title-strip":
    "rounded-md border border-line-subtle bg-surface " +
    "transition-[box-shadow,border-color,background-color] duration-150 ease-out " +
    "hover:border-line hover:shadow-card",
  "table-row":
    "bg-transparent transition-colors duration-150 ease-out hover:bg-surface-hover",
};

const ACTIVE_VARIANT: Record<UnifiedListCardVariant, string> = {
  "vendor-strip": "ring-1 ring-brand/40",
  "title-strip": "ring-1 ring-brand/40",
  "table-row": "bg-brand/[0.06]",
};

export function UnifiedListCard({
  variant,
  href,
  onClick,
  isActive = false,
  isDeferred = false,
  wash,
  className,
  children,
  ariaLabel,
}: UnifiedListCardProps) {
  const classes = cn(
    BASE_VARIANT[variant],
    isActive && ACTIVE_VARIANT[variant],
    isDeferred && "opacity-65",
    // Wash ueberschreibt bg-surface; bei table-row überschreibt es bg-transparent.
    wash,
    className,
  );

  if (href) {
    return (
      <Link
        href={href}
        prefetch={false}
        onClick={onClick}
        aria-label={ariaLabel}
        aria-current={isActive ? "true" : undefined}
        className={classes}
      >
        {children}
      </Link>
    );
  }

  return (
    <article
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={isActive ? "true" : undefined}
      className={classes}
    >
      {children}
    </article>
  );
}
