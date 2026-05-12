"use client";

/**
 * HeroStatCard — Bento-Style-KPI-Karte mit größerer visueller Präsenz.
 *
 * 12.05.2026 (DESIGN-Critique #3) — extrahiert als wiederverwendbare
 * Foundation-Komponente. Eliminiert „identical card grid" Anti-Pattern
 * (impeccable absolute ban) auf allen Surfaces wo eine KPI dominanter sein
 * sollte als die übrigen.
 *
 * Layout:
 *   - md:col-span-2 (doppelte Breite im Standard-4-col-Grid)
 *   - Größerer Numerus (text-5xl auf Mobile, text-6xl auf sm+)
 *   - 16px-Top-Gradient-Highlight statt 8px
 *   - corner-marks-Akzent oben rechts (industrielle Anmutung)
 *   - Optional: Sekundär-Wert rechts (Volumen-Pill, MoM-Delta, etc.)
 *
 * Eingesetzt in: Dashboard (HeroStatCard intern), Buchhaltung, Archiv.
 */

import * as React from "react";

export interface HeroStatCardProps {
  label: string;
  value: React.ReactNode;
  /** Top-Border-Color als CSS-Color-String (Token-Reference empfohlen). */
  color: string;
  /** Optionaler Sekundär-Wert rechts (z.B. Currency-Pill, Trend-Pfeil). */
  secondary?: React.ReactNode;
  /** Optionaler Badge (z.B. „Dringend", „Heute"). */
  badge?: string;
  /** Bei true: Numerus in Error-Tönung + Ring-Highlight. */
  alert?: boolean;
  /** Optional weitere Inhalte unter dem Numerus (z.B. Sparkline). */
  footer?: React.ReactNode;
  className?: string;
}

export function HeroStatCard({
  label,
  value,
  color,
  secondary,
  badge,
  alert,
  footer,
  className,
}: HeroStatCardProps) {
  return (
    <div
      className={`card card-hover relative overflow-hidden md:col-span-2 ${alert ? "ring-1 ring-error/30" : ""} ${className ?? ""}`}
      style={{ borderTop: `3px solid ${color}` }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-16 opacity-[0.09] pointer-events-none"
        style={{ background: `linear-gradient(180deg, ${color}, transparent)` }}
      />
      {/* corner-marks für industrielle Anmutung */}
      <span
        aria-hidden="true"
        className="absolute top-2 right-2 flex items-center gap-1"
      >
        <span className="block w-1.5 h-px bg-foreground-faint/40" />
        <span className="block h-1.5 w-px bg-foreground-faint/40" />
      </span>
      <div className="p-5 sm:p-6 relative">
        <div className="flex items-center gap-2 mb-2">
          <p className="text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase">
            {label}
          </p>
          {badge && (
            <span
              className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{ backgroundColor: `${color}1a`, color }}
            >
              {badge}
            </span>
          )}
        </div>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <p
            className={`font-mono-amount text-5xl sm:text-6xl font-bold leading-none tabular-nums ${alert ? "text-error" : "text-foreground"}`}
          >
            {value}
          </p>
          {secondary && (
            <div className="flex flex-col items-end gap-1.5">{secondary}</div>
          )}
        </div>
        {footer && <div className="mt-4">{footer}</div>}
      </div>
    </div>
  );
}
