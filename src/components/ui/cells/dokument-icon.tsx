/**
 * DokumentIcon — Anzeige ob ein Bestelldokument (Bestätigung/LS/RE/VS) vorhanden ist.
 *
 * Drei Varianten:
 *   1. vorhanden + onClick → klickbarer Button mit Hover-Scale + Vorschau-Trigger
 *   2. vorhanden ohne onClick → reines Check-Icon (z.B. in Read-Only-Listen wie Archiv)
 *   3. nicht vorhanden → leerer Kreis-Outline
 *
 * Vorher in `bestellungen-tabelle.tsx` als interne Helper-Funktion + im
 * `archiv-client.tsx` als inline-SVG dupliziert. Jetzt als shared UI-Cell.
 */

import { IconCheck } from "@/components/ui/icons";

export interface DokumentIconProps {
  vorhanden: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  /** Optionaler aria-label für Screen-Reader (z.B. "Rechnung vorhanden") */
  label?: string;
}

export function DokumentIcon({ vorhanden, onClick, onMouseEnter, label }: DokumentIconProps) {
  if (vorhanden && onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        className="p-1 -m-1 rounded-md transition-[background-color,transform] duration-150 ease-out hover:bg-success-bg hover:scale-110 cursor-pointer group/dok"
        title="Klicken für Vorschau"
        aria-label={label ? `${label} — Vorschau anzeigen` : "Vorschau anzeigen"}
      >
        <IconCheck className="w-4 h-4 text-success group-hover/dok:text-success" />
      </button>
    );
  }

  if (vorhanden) {
    return <IconCheck className="w-4 h-4 text-success" aria-label={label || "vorhanden"} />;
  }

  return (
    <div
      className="w-4 h-4 rounded-full border-2 border-line-strong"
      aria-label={label ? `${label} — fehlt` : "fehlt"}
      role="img"
    />
  );
}
