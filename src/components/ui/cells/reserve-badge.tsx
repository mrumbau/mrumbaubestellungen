"use client";

/**
 * ReserveBadge — Awareness-Marker für Pool-Soft-Reserve.
 *
 * 03.06.2026 (Pool 2.0 Sprint 2): Drei-Sprachen-Disziplin schreibt vor:
 * NICHT Owner (kein Brand-Color), NICHT Presence (keine Avatar-Stack),
 * NICHT Status (keine Status-Tokens). Eigene Sprache: Uhr-Glyph + Mono-
 * Countdown auf neutralem Canvas-Bg mit border-line-strong.
 *
 * State:
 *   - "andere Reserve" (default): "CR bearbeitet · 9:42"
 *   - "eigene Reserve" (variant="self"): "Du bearbeitest · 9:42 verbleibend"
 *
 * Countdown läuft client-side per setInterval(1000). Bei kind="expired"
 * rendert die Komponente null — andere User sehen den Pool-Item wieder
 * frei via Realtime-Subscribe-Update.
 */

import { useEffect, useState } from "react";
import { formatReserveCountdown } from "@/lib/pool-inbox-state";
import { cn } from "@/lib/cn";

export interface ReserveBadgeProps {
  /** Kürzel des reservierenden Users. */
  reserverKuerzel: string;
  /** Name (falls displayName ausgegeben werden soll statt Kürzel). */
  reserverName?: string;
  /** ISO timestamp wann die Reserve abläuft. */
  expiresAtIso: string;
  /**
   * "self" = ich bin der Reservierer (zeigt im Drawer). Andere = Awareness
   * auf der Pool-Karte.
   */
  variant?: "self" | "other";
  className?: string;
}

const TICK_MS = 1000;

export function ReserveBadge({
  reserverKuerzel,
  reserverName,
  expiresAtIso,
  variant = "other",
  className,
}: ReserveBadgeProps) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const countdown = formatReserveCountdown(expiresAtIso, now);
  if (countdown.kind === "expired") return null;

  const subject =
    variant === "self" ? "Du bearbeitest" : `${reserverKuerzel} bearbeitet`;
  const tail =
    variant === "self" ? `· ${countdown.label} verbleibend` : `· ${countdown.label}`;

  return (
    <span
      role="status"
      aria-live="off"
      title={reserverName ? `${reserverName} hält eine Soft-Reserve.` : undefined}
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
        strokeWidth={1.6}
        aria-hidden="true"
        className="h-3 w-3 text-foreground-faint"
      >
        <circle cx="8" cy="8" r="6" />
        <path d="M8 4.5V8l2 1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-sans">{subject}</span>
      <span className="font-mono-amount tabular-nums">{tail}</span>
    </span>
  );
}
