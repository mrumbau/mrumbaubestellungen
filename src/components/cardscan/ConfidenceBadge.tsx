"use client";

import { IconAlertCircle, IconAlertTriangle, IconCheckCircle } from "@/components/ui/icons";

interface ConfidenceBadgeProps {
  score: number | undefined;
  /** Wenn false: nur Icon, Prozentwert per aria-label. Default: true (Touch-Geräte sehen Prozent inline). */
  showPercent?: boolean;
}

/**
 * Konfidenz-Indikator für KI-extrahierte Felder.
 *
 * Color-not-only-konform (WCAG 1.4.1): Icon + Farbe + sr-only-Text statt nur farbiger Punkt.
 * - >= 0.8: kein Badge (Feld ist sicher)
 * - 0.5 – 0.79: Warning-Triangle (gelb, "unsicher")
 * - < 0.5: Alert-Circle (rot, "sehr unsicher")
 *
 * CU13: Default `showPercent=true` da `title=""` auf Touch-Geräten nicht aktivierbar ist
 * und sehende User den Score sonst nicht abrufen können.
 */
export function ConfidenceBadge({ score, showPercent = true }: ConfidenceBadgeProps) {
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
 * CU14: Icon zusätzlich zur Farbe (color-blind-konform).
 */
export function ConfidenceOverview({ overall }: ConfidenceOverviewProps) {
  const percent = Math.round(overall * 100);
  const tier =
    overall >= 0.8 ? "high" : overall >= 0.5 ? "mid" : "low";
  const bgColor = tier === "high" ? "bg-cs-success" : tier === "mid" ? "bg-warning" : "bg-error";
  const Icon = tier === "high" ? IconCheckCircle : tier === "mid" ? IconAlertTriangle : IconAlertCircle;
  const description =
    tier === "high"
      ? "Hohe Zuverlässigkeit"
      : tier === "mid"
        ? "Einige Felder unsicher – bitte prüfen"
        : "Viele unsichere Felder – bitte sorgfältig prüfen";

  return (
    <div className="card p-3 mb-6 flex items-center gap-3" role="status" aria-label={`Gesamt-Konfidenz: ${percent} Prozent`}>
      <div
        className={`w-10 h-10 rounded-md flex flex-col items-center justify-center text-white ${bgColor} relative`}
      >
        <Icon className="w-3.5 h-3.5 absolute top-1 right-1 opacity-80" aria-hidden="true" />
        <span className="text-body-sm font-bold leading-none">{percent}%</span>
      </div>
      <div>
        <p className="text-body-sm font-medium text-foreground">
          Gesamt-Konfidenz
        </p>
        <p className="text-meta text-foreground-subtle">{description}</p>
      </div>
    </div>
  );
}
