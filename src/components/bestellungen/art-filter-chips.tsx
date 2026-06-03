/**
 * ArtFilterChips — Quick-Filter-Chips für Bestellungsart (UX-R2, 03.06.2026).
 *
 * Ersetzt die alten ArtTabs in den 3 Lanes. Multi-Select: Material + Abo
 * gleichzeitig geht. URL-state via `?art=material,abo`. Wenn nichts gewählt
 * ist (URL ohne `?art=`), zeigt die Lane alles.
 *
 * **Warum Chips statt Tabs?** Tabs implizieren mutual-exclusive Sichten —
 * aber Bestellungsart ist orthogonal zur Lane. Chips sind kommutativ
 * (Material + Abo = "diese beiden Arten anzeigen") und reduzieren die
 * Tab-Inflation (heute: Scope-Tabs + Art-Tabs + Status-Filter = 3 Layer).
 *
 * Visual: kleine Pill-Buttons unter dem PageHero, neutral wenn inaktiv,
 * brand-tint wenn aktiv. Selection-Indicator ist `bg-brand/[0.08]`-Tint
 * statt solid brand — Stufe-3-Element nach Drei-Sprachen-Disziplin v2.
 */

"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export type Bestellungsart = "material" | "subunternehmer" | "abo";

export const ALL_BESTELLUNGSARTEN: ReadonlyArray<Bestellungsart> = [
  "material",
  "subunternehmer",
  "abo",
];

const LABELS: Record<Bestellungsart, string> = {
  material: "Material",
  subunternehmer: "Subunternehmer",
  abo: "Abo",
};

export function parseArtFilter(value: string | null | undefined): Set<Bestellungsart> {
  if (!value) return new Set();
  const tokens = value.split(",").map((t) => t.trim()).filter(Boolean);
  const valid = new Set<Bestellungsart>();
  for (const t of tokens) {
    if (t === "material" || t === "subunternehmer" || t === "abo") {
      valid.add(t);
    }
  }
  return valid;
}

export interface ArtFilterChipsProps {
  /** Counts pro Art für die Sub-Label-Anzeige. */
  counts: Record<Bestellungsart, number>;
  /** Optionale Visibility-Filter — z.B. Pool-Lane zeigt nur "material". */
  visibleArten?: ReadonlyArray<Bestellungsart>;
}

export function ArtFilterChips({ counts, visibleArten }: ArtFilterChipsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = parseArtFilter(searchParams.get("art"));

  const setArt = useCallback(
    (next: Set<Bestellungsart>) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.size === 0) {
        params.delete("art");
      } else {
        params.set("art", Array.from(next).join(","));
      }
      const qs = params.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ""}`);
    },
    [router, pathname, searchParams],
  );

  const toggle = useCallback(
    (art: Bestellungsart) => {
      const next = new Set(current);
      if (next.has(art)) next.delete(art);
      else next.add(art);
      setArt(next);
    },
    [current, setArt],
  );

  const arten = visibleArten ?? ALL_BESTELLUNGSARTEN;
  if (arten.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label="Bestellungsart filtern"
    >
      <span className="text-eyebrow uppercase tracking-[0.14em] text-foreground-subtle mr-1">
        Art
      </span>
      {arten.map((art) => {
        const isActive = current.has(art);
        const count = counts[art] ?? 0;
        return (
          <button
            key={art}
            type="button"
            onClick={() => toggle(art)}
            aria-pressed={isActive}
            className={cn(
              "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-meta font-medium",
              "transition-[background-color,color,border-color] duration-150 ease-out",
              "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
              isActive
                ? "bg-brand/[0.08] text-brand border border-brand/30"
                : "border border-line text-foreground-muted hover:text-foreground hover:border-line-strong",
            )}
          >
            <span>{LABELS[art]}</span>
            {count > 0 && (
              <span
                className={cn(
                  "font-mono-amount tabular-nums text-eyebrow",
                  isActive ? "text-brand" : "text-foreground-faint",
                )}
                aria-label={`${count} ${LABELS[art]}`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
      {current.size > 0 && (
        <button
          type="button"
          onClick={() => setArt(new Set())}
          className="ml-1 text-eyebrow uppercase tracking-[0.14em] text-foreground-subtle hover:text-foreground transition-colors"
        >
          zurücksetzen
        </button>
      )}
    </div>
  );
}
