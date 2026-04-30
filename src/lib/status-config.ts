/**
 * Status-Konfiguration — eckige Tags mit linkem Farbbalken + Icon.
 *
 * Vier-Komponenten-Schema pro Status, vollständig tokenisiert + WCAG-konform:
 *   - `color`: CSS-Variable für den linken Balken / Dot (wird inline als
 *              `style={{ background: ... }}` oder als `border-color` genutzt).
 *   - `bg`:    Tailwind-Utility für den Pill-Hintergrund.
 *   - `text`:  Tailwind-Utility für die Pill-Schrift.
 *   - `Icon`:  Erfüllt WCAG 1.4.1 (color-not-only) — Statusinformation darf
 *              nicht ausschließlich über Farbe transportiert werden.
 *
 * Änderungen am Status-Look passieren ausschließlich in `globals.css`
 * (`--status-*` Tokens). Diese Datei bleibt stabil.
 */
import {
  IconClock,
  IconArrowRight,
  IconCheck,
  IconAlertCircle,
  IconAlertTriangle,
  IconCheckCircle,
} from "@/components/ui/icons";
import type * as React from "react";

type IconComponent = (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element;

export const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; text: string; Icon: IconComponent }
> = {
  erwartet: {
    label: "Erwartet",
    color: "var(--status-erwartet)",
    bg: "bg-status-erwartet-bg",
    text: "text-status-erwartet-text",
    Icon: IconClock,
  },
  offen: {
    label: "Offen",
    color: "var(--status-offen)",
    bg: "bg-status-offen-bg",
    text: "text-status-offen-text",
    Icon: IconArrowRight,
  },
  vollstaendig: {
    label: "Vollständig",
    color: "var(--status-vollstaendig)",
    bg: "bg-status-vollstaendig-bg",
    text: "text-status-vollstaendig-text",
    Icon: IconCheck,
  },
  abweichung: {
    label: "Abweichung",
    color: "var(--status-abweichung)",
    bg: "bg-status-abweichung-bg",
    text: "text-status-abweichung-text",
    Icon: IconAlertCircle,
  },
  ls_fehlt: {
    label: "LS fehlt",
    color: "var(--status-ls-fehlt)",
    bg: "bg-status-ls-fehlt-bg",
    text: "text-status-ls-fehlt-text",
    Icon: IconAlertTriangle,
  },
  freigegeben: {
    label: "Freigegeben",
    color: "var(--status-freigegeben)",
    bg: "bg-status-freigegeben-bg",
    text: "text-status-freigegeben-text",
    Icon: IconCheckCircle,
  },
};

export function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.offen;
}
