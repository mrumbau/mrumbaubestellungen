"use client";

import { IconAlertCircle, IconAlertTriangle } from "@/components/ui/icons";

interface ConfidenceBadgeProps {
  score: number | undefined;
  /** Wenn true: Prozentwert wird inline angezeigt (für mobile/visible Kontexte). Default: nur Icon, Prozentwert nur per Tooltip/aria-label. */
  showPercent?: boolean;
}

/**
 * Konfidenz-Indikator für KI-extrahierte Felder.
 *
 * Color-not-only-konform (WCAG 1.4.1): Icon + Farbe + sr-only-Text statt nur farbiger Punkt.
 * - >= 0.8: kein Badge (Feld ist sicher)
 * - 0.5 – 0.79: Warning-Triangle (gelb, "unsicher")
 * - < 0.5: Alert-Circle (rot, "sehr unsicher")
 */
export function ConfidenceBadge({ score, showPercent = false }: ConfidenceBadgeProps) {
  if (score === undefined || score >= 0.8) return null;

  const isLow = score < 0.5;
  const percent = Math.round(score * 100);
  const Icon = isLow ? IconAlertCircle : IconAlertTriangle;
  const colorClass = isLow ? "text-error" : "text-warning";
  const label = isLow
    ? `Konfidenz ${percent} Prozent, sehr unsicher`
    : `Konfidenz ${percent} Prozent, unsicher`;

  return (
    <span
      className={`inline-flex items-center gap-1 ml-1.5 ${colorClass}`}
      role="img"
      aria-label={label}
      title={`${percent}%`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      {showPercent && (
        <span className="text-[10px] font-medium font-mono-amount">{percent}%</span>
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}

interface ConfidenceOverviewProps {
  overall: number;
}

/**
 * Gesamt-Confidence-Anzeige als Card-Element.
 */
export function ConfidenceOverview({ overall }: ConfidenceOverviewProps) {
  const percent = Math.round(overall * 100);
  const bgColor =
    overall >= 0.8
      ? "bg-cs-success"
      : overall >= 0.5
        ? "bg-warning"
        : "bg-error";

  const description =
    overall >= 0.8
      ? "Hohe Zuverlässigkeit"
      : overall >= 0.5
        ? "Einige Felder unsicher – bitte prüfen"
        : "Viele unsichere Felder – bitte sorgfältig prüfen";

  return (
    <div className="card p-3 mb-6 flex items-center gap-3" role="status" aria-label={`Gesamt-Konfidenz: ${percent} Prozent`}>
      <div
        className={`w-10 h-10 rounded-md flex items-center justify-center text-white text-sm font-bold ${bgColor}`}
      >
        {percent}%
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">
          Gesamt-Konfidenz
        </p>
        <p className="text-xs text-foreground-subtle">{description}</p>
      </div>
    </div>
  );
}
