/**
 * StatusCell — Status-Pill mit linkem Color-Bar + Icon + Label.
 *
 * Konsumiert `getStatusConfig()` aus `@/lib/status-config` zentral.
 * Color + Icon + Text werden aus dem Config geliefert; der Renderer ist
 * stateless.
 *
 * Pattern aus UI-Audit P3 (Phase-3-Findings F3.4): "color-not-only" —
 * Status wird mehrfach codiert (Farbe + Icon + Text) damit
 * Farbenblinde / SW-Druck den Status auch erkennen können.
 */

import { getStatusConfig } from "@/lib/status-config";

export interface StatusCellProps {
  status: string;
}

export function StatusCell({ status }: StatusCellProps) {
  const cfg = getStatusConfig(status);
  return (
    <span className={`status-tag ${cfg.bg} ${cfg.text}`}>
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-sm"
        style={{ background: cfg.color }}
      />
      <cfg.Icon className="w-3 h-3 mr-1 shrink-0" aria-hidden="true" />
      <span className="sr-only">Status: </span>
      {cfg.label}
    </span>
  );
}
