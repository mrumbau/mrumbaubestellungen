import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * EditorialSection — Foundation-Wrapper für Hot-Path-Sections im Inneren.
 *
 * Schließt die Lücke zwischen Außen-Surfaces (Login/Landing/404, editorial-
 * luxury mit Bezel + Film-Grain + Industrial-Patterns) und Innen-Surfaces
 * (Bestellungen/Detail/Dashboard), die heute wie ein anderes Produkt wirken.
 *
 * Kapselt drei Foundation-Klassen aus globals.css zu einer wiederverwendbaren
 * Primitive:
 *  - `corner-marks`     → L-shaped Brand-Akzente an den Card-Ecken (opacity 0.1)
 *  - `industrial-line`  → Gradient-Separator oben/unten
 *  - `film-grain` /
 *    `film-grain-light` → Papier-Textur als Overlay (pointer-events: none)
 *
 * Default ist sehr ruhig: nur Border + Padding + Surface. Die editorial-
 * Ornamentik wird per Prop dazugeschaltet. So bleibt die Komponente in
 * Settings/System-Pages unauffällig nutzbar und kann in Hot-Path-Pages
 * (Bestellungen/Detail/Dashboard) als WOW-Statement getriggert werden.
 *
 * Niemals nested EditorialSection in EditorialSection. Wenn ein Block
 * mehrere Sub-Sections braucht, nutze `industrial-line` als Separator
 * innerhalb der einen EditorialSection.
 */
export type EditorialSectionProps = {
  children: React.ReactNode;
  /** Visuelle Tönung. brand = MR-Red corner-marks. neutral = ohne marks. */
  tone?: "brand" | "neutral";
  /** L-shaped Brand-Akzente an Card-Ecken (oben rechts + unten links). */
  marks?: boolean;
  /** `industrial-line`-Gradient als Separator oberhalb des Inhalts. */
  lineTop?: boolean;
  /** `industrial-line`-Gradient als Separator unterhalb des Inhalts. */
  lineBottom?: boolean;
  /** Film-Grain-Overlay (Papier-Textur). `subtle` = 6% opacity, `light` = 18% (dunkle Surfaces). */
  grain?: false | "subtle" | "light";
  /** Render-Element. Default = section. Für Header-Blöcke `header` setzen. */
  as?: "section" | "header" | "article" | "div";
  /** Padding-Skala. Default = relaxed (`p-6 sm:p-8`). */
  padding?: "none" | "compact" | "relaxed";
  className?: string;
  ariaLabel?: string;
};

const paddingClasses: Record<NonNullable<EditorialSectionProps["padding"]>, string> = {
  none: "",
  compact: "p-4 sm:p-5",
  relaxed: "p-6 sm:p-8",
};

export function EditorialSection({
  children,
  tone = "neutral",
  marks = false,
  lineTop = false,
  lineBottom = false,
  grain = false,
  as: Tag = "section",
  padding = "relaxed",
  className,
  ariaLabel,
}: EditorialSectionProps) {
  const showMarks = marks && tone === "brand";
  const hasGrain = grain !== false;

  return (
    <Tag
      aria-label={ariaLabel}
      className={cn(
        "relative isolate overflow-hidden",
        "rounded-2xl border border-line bg-card",
        showMarks && "corner-marks",
        paddingClasses[padding],
        className,
      )}
    >
      {lineTop && (
        <div className="industrial-line absolute inset-x-0 top-0" aria-hidden="true" />
      )}
      {hasGrain && (
        <div
          className={grain === "light" ? "film-grain-light" : "film-grain"}
          aria-hidden="true"
        />
      )}
      <div className="relative z-[1]">{children}</div>
      {lineBottom && (
        <div className="industrial-line absolute inset-x-0 bottom-0" aria-hidden="true" />
      )}
    </Tag>
  );
}
