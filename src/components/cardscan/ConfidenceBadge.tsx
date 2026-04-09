"use client";

interface ConfidenceBadgeProps {
  score: number | undefined;
}

/**
 * Zeigt einen farbigen Punkt neben einem Feld an, wenn die Confidence unter 0.8 liegt.
 * - >= 0.8: unsichtbar (kein Badge)
 * - 0.5 - 0.79: gelber Punkt (unsicher)
 * - < 0.5: roter Punkt (sehr unsicher)
 */
export function ConfidenceBadge({ score }: ConfidenceBadgeProps) {
  if (score === undefined || score >= 0.8) return null;

  const isLow = score < 0.5;
  const color = isLow ? "bg-red-500" : "bg-amber-400";
  const percent = Math.round(score * 100);
  const label = isLow
    ? `Confidence ${percent} Prozent, sehr unsicher`
    : `Confidence ${percent} Prozent, unsicher`;

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${color} ml-1.5`}
      role="img"
      aria-label={label}
      title={`${percent}%`}
    />
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
      ? "bg-emerald-600"
      : overall >= 0.5
        ? "bg-amber-500"
        : "bg-red-600";

  const description =
    overall >= 0.8
      ? "Hohe Zuverlässigkeit"
      : overall >= 0.5
        ? "Einige Felder unsicher – bitte prüfen"
        : "Viele unsichere Felder – bitte sorgfältig prüfen";

  return (
    <div className="card p-3 mb-6 flex items-center gap-3" role="status" aria-label={`Gesamt-Confidence: ${percent} Prozent`}>
      <div
        className={`w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center text-white text-sm font-bold ${bgColor}`}
      >
        {percent}%
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">
          Gesamt-Confidence
        </p>
        <p className="text-xs text-[var(--text-tertiary)]">{description}</p>
      </div>
    </div>
  );
}
