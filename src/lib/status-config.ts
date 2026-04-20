/**
 * Status-Konfiguration — eckige Tags mit linkem Farbbalken.
 *
 * Drei-Komponenten-Farbschema pro Status, vollständig tokenisiert:
 *   - `color`: CSS-Variable für den linken Balken / Dot (wird inline als
 *              `style={{ background: ... }}` oder als `border-color` genutzt).
 *   - `bg`:    Tailwind-Utility für den Pill-Hintergrund.
 *   - `text`:  Tailwind-Utility für die Pill-Schrift.
 *
 * Änderungen am Status-Look passieren ausschließlich in `globals.css`
 * (`--status-*` Tokens). Diese Datei bleibt stabil.
 */
export const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; text: string }
> = {
  erwartet: {
    label: "Erwartet",
    color: "var(--status-erwartet)",
    bg: "bg-status-erwartet-bg",
    text: "text-status-erwartet-text",
  },
  offen: {
    label: "Offen",
    color: "var(--status-offen)",
    bg: "bg-status-offen-bg",
    text: "text-status-offen-text",
  },
  vollstaendig: {
    label: "Vollständig",
    color: "var(--status-vollstaendig)",
    bg: "bg-status-vollstaendig-bg",
    text: "text-status-vollstaendig-text",
  },
  abweichung: {
    label: "Abweichung",
    color: "var(--status-abweichung)",
    bg: "bg-status-abweichung-bg",
    text: "text-status-abweichung-text",
  },
  ls_fehlt: {
    label: "LS fehlt",
    color: "var(--status-ls-fehlt)",
    bg: "bg-status-ls-fehlt-bg",
    text: "text-status-ls-fehlt-text",
  },
  freigegeben: {
    label: "Freigegeben",
    color: "var(--status-freigegeben)",
    bg: "bg-status-freigegeben-bg",
    text: "text-status-freigegeben-text",
  },
};

export function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.offen;
}
