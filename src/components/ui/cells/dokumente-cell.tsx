/**
 * DokumenteCell — konsolidierte Dokument-Indikator-Spalte.
 *
 * 02.06.2026 (UI-Polish nach Pool-Reform): vorher waren BB/LS/RE/VS vier
 * separate Tabellen-Spalten (je ~70px). Dadurch ~280px Tabellen-Breite
 * für 4 meist-leere Radio-Circles. Jetzt eine Spalte mit 4 inline-Slot-Dots
 * + tooltip — gleiche Information, ein Drittel der Breite.
 *
 * Drei-Sprachen-Disziplin: bleibt im neutralen Token-Set
 * (text-foreground-subtle für leer, status-vollstaendig für vorhanden),
 * keine eigene Color-Familie. Color-not-only erfüllt — jeder Slot hat
 * Buchstaben-Label (B/L/R/V) im aria-/title-Tooltip.
 *
 * Klick auf gefüllten Dot → PDF-Preview wie bisher pro Dokument-Spalte.
 */

import type React from "react";

export interface DokumenteCellProps {
  hat_bestellbestaetigung?: boolean;
  hat_lieferschein?: boolean;
  hat_rechnung?: boolean;
  hat_versandbestaetigung?: boolean;
  /** Bestellungsart — bei SU/Abo wird der Slot gedimmt (kein BB/LS/VS-Workflow). */
  bestellungsart?: string | null;
  /** Klick auf gefüllten Slot öffnet die PDF-Preview. */
  onPreview?: (typ: "bestellbestaetigung" | "lieferschein" | "rechnung" | "versandbestaetigung") => void;
  /** Hover/Focus preload Hint für RSC. */
  onPreload?: (typ: "bestellbestaetigung" | "lieferschein" | "rechnung" | "versandbestaetigung") => void;
}

interface SlotConfig {
  key: "bestellbestaetigung" | "lieferschein" | "rechnung" | "versandbestaetigung";
  letter: string;
  label: string;
}

const SLOTS: readonly SlotConfig[] = [
  { key: "bestellbestaetigung", letter: "B", label: "Bestellbestätigung" },
  { key: "lieferschein", letter: "L", label: "Lieferschein" },
  { key: "rechnung", letter: "R", label: "Rechnung" },
  { key: "versandbestaetigung", letter: "V", label: "Versandbestätigung" },
];

export function DokumenteCell({
  hat_bestellbestaetigung,
  hat_lieferschein,
  hat_rechnung,
  hat_versandbestaetigung,
  bestellungsart,
  onPreview,
  onPreload,
}: DokumenteCellProps) {
  const art = bestellungsart || "material";
  const isSuOderAbo = art === "subunternehmer" || art === "abo";

  const flags: Record<SlotConfig["key"], boolean | undefined> = {
    bestellbestaetigung: hat_bestellbestaetigung,
    lieferschein: hat_lieferschein,
    rechnung: hat_rechnung,
    versandbestaetigung: hat_versandbestaetigung,
  };

  // SU/Abo haben kein BB/LS/VS-Workflow — nur RE ist relevant. Andere Slots
  // werden als gedimmte placeholder-Bullets gerendert.
  const dimmedForArt: Record<SlotConfig["key"], boolean> = {
    bestellbestaetigung: isSuOderAbo,
    lieferschein: isSuOderAbo,
    rechnung: false,
    versandbestaetigung: isSuOderAbo,
  };

  const summary = SLOTS.map((s) => {
    if (dimmedForArt[s.key]) return `${s.letter}: ·`;
    return `${s.letter}: ${flags[s.key] ? "✓" : "fehlt"}`;
  }).join(" · ");

  return (
    <div
      className="inline-flex items-center gap-1"
      title={summary}
      role="group"
      aria-label={`Dokumente: ${summary}`}
    >
      {SLOTS.map((s) => {
        const present = !!flags[s.key];
        const dimmed = dimmedForArt[s.key];
        const clickable = present && !dimmed && onPreview;
        const handleClick: React.MouseEventHandler<HTMLButtonElement> | undefined = clickable
          ? (e) => {
              e.stopPropagation();
              onPreview(s.key);
            }
          : undefined;
        const handleEnter = present && !dimmed && onPreload
          ? () => onPreload(s.key)
          : undefined;
        const Tag = (clickable ? "button" : "span") as "button" | "span";
        return (
          <Tag
            key={s.key}
            type={clickable ? "button" : undefined}
            onClick={handleClick}
            onMouseEnter={handleEnter}
            onFocus={handleEnter}
            className={[
              "inline-flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold font-mono-amount leading-none transition-colors",
              dimmed
                ? "bg-canvas text-foreground-faint border border-line-subtle"
                : present
                  ? clickable
                    ? "bg-success-bg text-status-freigegeben border border-status-freigegeben/30 cursor-pointer hover:bg-success-bg/70 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
                    : "bg-success-bg text-status-freigegeben border border-status-freigegeben/30"
                  : "bg-canvas text-foreground-subtle border border-line-subtle",
            ].join(" ")}
            aria-label={`${s.label} ${dimmed ? "nicht relevant" : present ? "vorhanden — Klick öffnet Vorschau" : "fehlt"}`}
          >
            {s.letter}
          </Tag>
        );
      })}
    </div>
  );
}
