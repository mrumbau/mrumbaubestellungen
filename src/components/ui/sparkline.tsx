/**
 * Sparkline — reines SVG, keine externe Library.
 *
 * Zeichnet eine Linie durch n Datenpunkte, optional gefüllte Fläche darunter.
 * Für Dashboard-Trend-Miniaturen (14 Tage Volumen pro Tag etc.).
 * Keine Achsen, keine Tooltips — das ist eine Spark, kein Chart.
 *
 * A11y: `<title>`-Element im SVG für Screenreader + role=img.
 */
export interface SparklineProps {
  /** Datenpunkte in chronologischer Reihenfolge (alt → neu) */
  data: number[];
  /** Stroke-Farbe als CSS-Token-Ref, z.B. "var(--status-freigegeben)" */
  color?: string;
  width?: number;
  height?: number;
  /** Wenn true: transparente Fläche unter der Linie füllen */
  fill?: boolean;
  /** A11y: beschreibender Alt-Text */
  ariaLabel?: string;
  className?: string;
}

export function Sparkline({
  data,
  color = "var(--mr-red)",
  width = 100,
  height = 24,
  fill = true,
  ariaLabel,
  className,
}: SparklineProps) {
  if (data.length < 2) {
    // Mit weniger als 2 Punkten keine sinnvolle Linie — kleinen Platzhalter zeigen
    return (
      <div
        className={className}
        style={{ width, height }}
        aria-hidden="true"
      />
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 1; // Kein Clipping an den Rändern

  // Punkte berechnen: x gleichmäßig verteilt, y invertiert (SVG-y ist oben=0)
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - 2 * pad) + pad;
    const y = height - pad - ((v - min) / range) * (height - 2 * pad);
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`))
    .join(" ");

  // Für Fill: Linie schließen zum Baseline (unten) und zurück
  const fillPath = `${linePath} L ${points[points.length - 1][0]} ${height} L ${points[0][0]} ${height} Z`;

  // Default-Label enthält min/max-Werte für Screenreader-Kontext
  const trend = data[data.length - 1]! >= data[0]! ? "steigend" : "fallend";
  const computedLabel =
    ariaLabel ??
    `Trend mit ${data.length} Datenpunkten (${trend}, Minimum ${min.toLocaleString("de-DE")}, Maximum ${max.toLocaleString("de-DE")})`;

  return (
    <svg
      role="img"
      aria-label={computedLabel}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
    >
      <title>{computedLabel}</title>
      {fill && (
        <path d={fillPath} fill={color} fillOpacity={0.08} stroke="none" />
      )}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
