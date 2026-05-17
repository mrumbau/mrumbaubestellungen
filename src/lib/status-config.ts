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
  // 17.05.2026 — Gutschrift (Rückerstattung): Rechnung mit Saldo zugunsten MRU.
  // Eigene visuelle Identität (success-grün), damit User NIE eine Gutschrift
  // mit einer zu zahlenden Rechnung verwechselt. Wird statt status angezeigt
  // wenn bestellung.ist_gutschrift = true.
  gutschrift: {
    label: "Gutschrift",
    color: "var(--status-freigegeben)",
    bg: "bg-status-freigegeben-bg",
    text: "text-status-freigegeben-text",
    Icon: IconCheckCircle,
  },
};

export function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.offen;
}

/**
 * Effektiver Status-Key für UI-Display. Gutschrift überschreibt den
 * regulären Status — User sieht "GUTSCHRIFT" statt "VOLLSTÄNDIG", weil
 * die Freigabe-Semantik nicht zutrifft (Geld kommt zurück, nicht raus).
 */
export function getEffektiverStatus(status: string, istGutschrift?: boolean | null): string {
  if (istGutschrift) return "gutschrift";
  return status;
}

/**
 * Status-Optionen für Filter-Selects. Synchron mit STATUS_CONFIG-Keys
 * plus "" für "Alle Status"-Default.
 *
 * Single source of truth: bei einem neuen Status muss nur STATUS_CONFIG
 * (oben) ergänzt werden plus dieser Eintrag.
 */
// 07.05.2026 — "abweichung" und "ls_fehlt" entfernt: redundant zu Mahnungs-
// Tracking + abgleiche-Tabelle, im Workflow nicht mehr genutzt. STATUS_CONFIG
// bleibt für Render-Backwards-Compat, falls historische Bestellungen sie noch
// hätten — aktuell keine.
export const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Alle Status" },
  { value: "offen", label: "Offen" },
  { value: "vollstaendig", label: "Vollständig" },
  { value: "freigegeben", label: "Freigegeben" },
];
