"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { IconCheck, IconX, IconUsers } from "@/components/ui/icons";
import type { Bestellung, ProjektOption } from "./types";

/**
 * KiVorschlagBanner — the amber "KI-Vorschlag" card in the sidebar.
 *
 * Two states:
 *  - Initial: Korrekt / Falsch buttons + context (projekt, konfidenz, methode)
 *  - Correction: List of alternative projects to assign as the correct one
 *
 * Rendered both on desktop (sidebar) and on mobile (details tab) — caller
 * decides the variant via `compact` prop (compact = no "Ohne Korrektur
 * ablehnen" extra control, used in mobile).
 */
const METHODEN_LABELS: Record<string, string> = {
  lieferadresse: "Lieferadresse",
  kundenname: "Kundenname",
  projektname_text: "Projektname im Text",
  besteller_affinitaet: "Besteller-Muster",
};

export function KiVorschlagBanner({
  bestellung,
  projekte,
  loading,
  onVorschlagAktion,
  compact = false,
}: {
  bestellung: Bestellung;
  projekte: ProjektOption[];
  loading: boolean;
  onVorschlagAktion: (
    aktion: "bestaetigen" | "ablehnen",
    korrektesProjektId?: string,
  ) => void;
  compact?: boolean;
}) {
  const [showKorrektur, setShowKorrektur] = useState(false);

  // Visibility guard — only render when there is a non-confirmed KI suggestion
  if (
    !bestellung.projekt_vorschlag_id ||
    bestellung.projekt_bestaetigt ||
    bestellung.projekt_id
  ) {
    return null;
  }

  const vorschlagProjekt = projekte.find((p) => p.id === bestellung.projekt_vorschlag_id);
  const konfidenz = Math.round((bestellung.projekt_vorschlag_konfidenz || 0) * 100);

  return (
    <Card padding="md">
      <div className="flex items-center gap-2 mb-3">
        <span
          aria-hidden="true"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-brand/5 text-brand"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M10 2a1 1 0 01.894.553l1.382 2.764 2.764 1.382a1 1 0 010 1.788l-2.764 1.382-1.382 2.764a1 1 0 01-1.788 0L7.724 9.87 4.96 8.488a1 1 0 010-1.788l2.764-1.382 1.382-2.764A1 1 0 0110 2z" />
          </svg>
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-brand">
          KI-Vorschlag
        </span>
      </div>

      {bestellung.lieferadresse_erkannt && !compact && (
        <div className="flex items-start gap-2 mb-2.5 px-2.5 py-2 bg-canvas rounded-md">
          <svg
            aria-hidden="true"
            className="w-3.5 h-3.5 text-foreground-subtle mt-0.5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span className="text-[12px] text-foreground-muted">
            {bestellung.lieferadresse_erkannt}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 mb-1.5">
        <span
          aria-hidden="true"
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ background: vorschlagProjekt?.farbe || "var(--mr-red)" }}
        />
        <span className="text-[13px] font-medium text-foreground">
          {vorschlagProjekt?.name || "Unbekanntes Projekt"}
        </span>
        {compact && (
          <span className="font-mono-amount text-[11px] font-bold text-brand ml-auto">
            {konfidenz}%
          </span>
        )}
      </div>

      {!compact && (
        <div className="flex items-center gap-2 mb-2">
          <span className="font-mono-amount text-[11px] font-bold text-brand">
            {konfidenz}%
          </span>
          <span className="text-[10px] text-foreground-subtle">
            {METHODEN_LABELS[bestellung.projekt_vorschlag_methode || ""] ||
              bestellung.projekt_vorschlag_methode}
          </span>
        </div>
      )}

      {bestellung.projekt_vorschlag_begruendung && !compact && (
        <p className="text-[11px] text-foreground-subtle italic mb-3">
          &ldquo;{bestellung.projekt_vorschlag_begruendung}&rdquo;
        </p>
      )}

      {vorschlagProjekt?.budget && !compact && (
        <div className="px-2.5 py-1.5 bg-canvas rounded-md mb-3 text-[10px] text-foreground-subtle">
          Budget:{" "}
          <span className="font-mono-amount font-medium text-foreground-muted">
            {vorschlagProjekt.budget.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
          </span>
        </div>
      )}

      {bestellung.kunden_name && !compact && (
        <div className="flex items-center gap-1.5 mb-3 px-2.5 py-1.5 bg-canvas rounded-md">
          <IconUsers className="h-3 w-3 text-foreground-subtle" />
          <span className="text-[11px] text-foreground-muted">
            Kunde: <span className="font-medium text-foreground">{bestellung.kunden_name}</span>
          </span>
        </div>
      )}

      {!showKorrektur ? (
        <div className="flex items-center gap-2">
          <Button
            variant="subtle"
            size="sm"
            fullWidth
            onClick={() => onVorschlagAktion("bestaetigen")}
            disabled={loading}
            iconLeft={<IconCheck />}
            className="bg-success-bg text-success hover:bg-success-bg/80 border-success-border"
          >
            Korrekt
          </Button>
          <Button
            variant="subtle"
            size="sm"
            fullWidth
            onClick={() => setShowKorrektur(true)}
            disabled={loading}
            iconLeft={<IconX />}
            className="bg-error-bg text-error hover:bg-error-bg/80 border-error-border"
          >
            Falsch
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-foreground-subtle">Korrektes Projekt auswählen:</p>
          <ul className="space-y-1">
            {projekte
              .filter((p) => p.id !== bestellung.projekt_vorschlag_id)
              .map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onVorschlagAktion("ablehnen", p.id)}
                    disabled={loading}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-[12px] text-left rounded-md border border-line",
                      "hover:bg-surface-hover transition-colors disabled:opacity-50",
                      "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: p.farbe }}
                    />
                    {p.name}
                  </button>
                </li>
              ))}
          </ul>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => onVorschlagAktion("ablehnen")}
              disabled={loading}
              className={cn(
                "text-[11px] text-foreground-subtle hover:text-error transition-colors",
                "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] rounded px-1",
              )}
            >
              Ohne Korrektur ablehnen
            </button>
            <button
              type="button"
              onClick={() => setShowKorrektur(false)}
              className={cn(
                "text-[11px] text-foreground-subtle hover:text-foreground-muted transition-colors",
                "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] rounded px-1",
              )}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
