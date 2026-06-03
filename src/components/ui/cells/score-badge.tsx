/**
 * ScoreBadge — subtile Priorität-Pille für Top-X% Pool-Items.
 *
 * 03.06.2026 (Pool 2.0 Sprint 3): zeigt sich nur bei Score ≥ Schwelle
 * (Default 0.8 aus firma_einstellungen.pool_score_top_x_threshold). Trägt
 * eigene Visual-Sprache:
 *   - KEIN Brand-Color (würde mit Owner-Pill kollidieren)
 *   - KEIN Status-Triplet (würde mit StatusCell kollidieren)
 *   - Neutral border-line-strong bg-canvas text-foreground-muted
 *   - Glyph: ↑ (Pfeil hoch = Priorität)
 *
 * Tooltip enthält den Score-Breakdown (Age/Urgency/Vorschlag/Affinität)
 * für Transparenz-Nachweis.
 */

import { cn } from "@/lib/cn";
import type { ScoreBreakdown } from "@/lib/pool-score";

export interface ScoreBadgeProps {
  score: ScoreBreakdown;
  /** Threshold-Wert (default 0.8). */
  threshold?: number;
  className?: string;
}

export function ScoreBadge({ score, threshold = 0.8, className }: ScoreBadgeProps) {
  if (score.total < threshold) return null;

  const tooltipParts = [
    `Score ${(score.total * 100).toFixed(0)}%`,
    `· Alter ${(score.parts.age * 100).toFixed(0)}%`,
    `· Dringend ${(score.parts.urgency * 100).toFixed(0)}%`,
    `· Vorschlag ${(score.parts.vorschlag_konf * 100).toFixed(0)}%`,
    `· Projekt ${(score.parts.projekt_aff * 100).toFixed(0)}%`,
    `· Vendor ${(score.parts.vendor_aff * 100).toFixed(0)}%`,
  ];

  return (
    <span
      title={tooltipParts.join(" ")}
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px]",
        "border border-line-strong bg-canvas text-foreground-muted",
        className,
      )}
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-3 w-3"
      >
        <path d="M8 13V3M4 7l4-4 4 4" />
      </svg>
      <span className="font-sans">Priorität</span>
    </span>
  );
}
