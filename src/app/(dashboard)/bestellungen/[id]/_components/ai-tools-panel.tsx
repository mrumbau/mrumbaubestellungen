"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import {
  IconCheck,
  IconAlertCircle,
  IconChevronDown,
} from "@/components/ui/icons";
import { CollapsibleWidget } from "./collapsible-widget";
import type { Abgleich, Bestellung, DuplikatResult, KatResult, WidgetId } from "./types";

/**
 * AIToolsPanel — consolidated "KI-Tools" sidebar widget.
 *
 * Contains three horizontally-stacked sections inside a single CollapsibleWidget:
 *   1. KI-Abgleich status (✓ OK / Abweichungs-Liste / Placeholder if docs missing)
 *   2. KI-Zusammenfassung (generate on demand, caches result)
 *   3. Analyse-Aktionen (Duplikat-Check, Kategorisierung) with inline result cards
 *
 * Why kept together:
 *   - Users treat these as one "KI bench"
 *   - Toggling three separate widgets fragments the sidebar vertical rhythm
 *   - Shared context: all three operate on the same bestellung + dokumente
 */
export function AiToolsPanel({
  abgleich,
  bestellung,
  openWidgetId,
  onToggleWidget,
  kiZusammenfassung,
  kiLoading,
  onKiZusammenfassung,
  duplikatResult,
  duplikatLoading,
  onDuplikatCheck,
  katResult,
  katLoading,
  onKategorisierung,
}: {
  abgleich: Abgleich | null;
  bestellung: Bestellung;
  openWidgetId: string | null;
  onToggleWidget: (id: string) => void;
  kiZusammenfassung: string | null;
  kiLoading: boolean;
  onKiZusammenfassung: () => void;
  duplikatResult: DuplikatResult | null;
  duplikatLoading: boolean;
  onDuplikatCheck: () => void;
  katResult: KatResult | null;
  katLoading: boolean;
  onKategorisierung: () => void;
}) {
  const [openAbweichungen, setOpenAbweichungen] = useState<Record<number, boolean>>({});

  const statusBadge =
    abgleich?.status === "ok" ? (
      <span aria-hidden="true" className="w-2 h-2 rounded-full bg-status-freigegeben shrink-0" />
    ) : abgleich?.status === "abweichung" ? (
      <span aria-hidden="true" className="w-2 h-2 rounded-full bg-error shrink-0 pulse-urgent" />
    ) : undefined;

  return (
    <CollapsibleWidget
      title="KI-Tools"
      icon={
        <span aria-hidden="true" className="text-brand [&_svg]:h-4 [&_svg]:w-4">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 2a1 1 0 01.894.553l1.382 2.764 2.764 1.382a1 1 0 010 1.788l-2.764 1.382-1.382 2.764a1 1 0 01-1.788 0L7.724 9.87 4.96 8.488a1 1 0 010-1.788l2.764-1.382 1.382-2.764A1 1 0 0110 2z" />
          </svg>
        </span>
      }
      badge={statusBadge}
      widgetId="ki-tools"
      openWidgetId={openWidgetId}
      onToggleWidget={onToggleWidget}
    >
      {/* KI-Abgleich */}
      <AbgleichBlock
        abgleich={abgleich}
        bestellung={bestellung}
        openAbweichungen={openAbweichungen}
        onToggleAbweichung={(i) =>
          setOpenAbweichungen((prev) => ({ ...prev, [i]: !prev[i] }))
        }
      />

      <div className="h-px bg-line-subtle my-3" aria-hidden="true" />

      {/* Zusammenfassung */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground-subtle">
            Zusammenfassung
          </span>
          <Button
            variant="subtle"
            size="sm"
            onClick={onKiZusammenfassung}
            loading={kiLoading}
            className="h-6 text-[11px] px-2 py-0 bg-brand/5 text-brand border-0 hover:bg-brand/10"
          >
            Generieren
          </Button>
        </div>
        {kiZusammenfassung ? (
          <p className="text-[12px] text-foreground-muted leading-relaxed">
            {kiZusammenfassung}
          </p>
        ) : (
          <p className="text-[12px] text-foreground-subtle">
            KI-Zusammenfassung der Artikel und Dokumente.
          </p>
        )}
      </div>

      <div className="h-px bg-line-subtle mb-3" aria-hidden="true" />

      {/* Analyse-Aktionen */}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          fullWidth
          onClick={onDuplikatCheck}
          loading={duplikatLoading}
        >
          Duplikat prüfen
        </Button>
        <Button
          variant="secondary"
          size="sm"
          fullWidth
          onClick={onKategorisierung}
          loading={katLoading}
        >
          Kategorien
        </Button>
      </div>

      {duplikatResult && (
        <div
          className={cn(
            "rounded-md p-2.5 text-[12px] mt-2 border",
            duplikatResult.ist_duplikat
              ? "bg-error-bg border-error-border"
              : "bg-success-bg border-success-border",
          )}
        >
          <span
            className={cn(
              "font-semibold",
              duplikatResult.ist_duplikat ? "text-error" : "text-success",
            )}
          >
            {duplikatResult.ist_duplikat ? "Mögliches Duplikat!" : "Kein Duplikat"}
          </span>
          <p
            className={cn(
              "mt-1 leading-relaxed",
              duplikatResult.ist_duplikat ? "text-error/80" : "text-success/80",
            )}
          >
            {duplikatResult.begruendung}
          </p>
        </div>
      )}

      {katResult && katResult.kategorien.length > 0 && (
        <div className="space-y-1.5 mt-2">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(katResult.zusammenfassung).map(([kat, anzahl]) => (
              <Badge key={kat} tone="brand" size="sm">
                {kat} ({anzahl})
              </Badge>
            ))}
          </div>
          <div className="text-[10px] text-foreground-subtle">
            {katResult.kategorien.map((k) => `${k.artikel}: ${k.kategorie}`).join(" · ")}
          </div>
        </div>
      )}
    </CollapsibleWidget>
  );
}

function AbgleichBlock({
  abgleich,
  bestellung,
  openAbweichungen,
  onToggleAbweichung,
}: {
  abgleich: Abgleich | null;
  bestellung: Bestellung;
  openAbweichungen: Record<number, boolean>;
  onToggleAbweichung: (i: number) => void;
}) {
  if (!abgleich) {
    return (
      <div className="mb-3">
        <p className="text-[11px] text-foreground-subtle mb-2">
          Abgleich startet sobald alle Dokumente vorliegen.
        </p>
        <div className="flex gap-1.5 flex-wrap">
          {[
            { key: "hat_bestellbestaetigung" as const, label: "Best." },
            { key: "hat_lieferschein" as const, label: "LS" },
            { key: "hat_rechnung" as const, label: "RE" },
          ].map((d) => {
            const vorhanden = bestellung[d.key];
            return (
              <span
                key={d.key}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-1 rounded text-[10px]",
                  vorhanden
                    ? "bg-success-bg text-status-freigegeben font-medium"
                    : "bg-canvas text-foreground-subtle",
                )}
              >
                {vorhanden ? (
                  <IconCheck className="h-2.5 w-2.5" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="w-2.5 h-2.5 rounded-full border border-dashed border-line-strong"
                  />
                )}
                {d.label}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  if (abgleich.status === "ok") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-success-bg rounded-md mb-3">
        <IconCheck className="h-4 w-4 text-success shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-success">
            Alle Dokumente stimmen überein
          </p>
          <p className="text-[10px] text-success/70">
            {new Date(abgleich.erstellt_am).toLocaleDateString("de-DE")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 px-3 py-2 bg-error-bg rounded-md">
        <IconAlertCircle className="h-4 w-4 text-error shrink-0" />
        <p className="text-[12px] font-semibold text-error">
          {abgleich.abweichungen?.length === 1
            ? "1 Abweichung"
            : `${abgleich.abweichungen?.length || 0} Abweichungen`}
        </p>
      </div>
      {abgleich.abweichungen && abgleich.abweichungen.length > 0 && (
        <ul className="space-y-1 mt-2">
          {abgleich.abweichungen.map((a, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => onToggleAbweichung(i)}
                aria-expanded={!!openAbweichungen[i]}
                className={cn(
                  "w-full flex items-center justify-between px-2.5 py-1.5 rounded",
                  "bg-error-bg/70 hover:bg-error-bg transition-colors text-[11px]",
                  "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
                )}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      a.schwere === "hoch" ? "bg-error" : "bg-warning",
                    )}
                  />
                  <span className="font-medium text-error">{a.feld}</span>
                  {a.artikel && (
                    <span className="text-error/80 truncate max-w-[100px]">
                      ({a.artikel})
                    </span>
                  )}
                </div>
                <IconChevronDown
                  className={cn(
                    "h-3 w-3 text-error/60 transition-transform",
                    openAbweichungen[i] ? "rotate-180" : "",
                  )}
                />
              </button>
              {openAbweichungen[i] && (
                <div className="ml-4 mt-0.5 mb-1 px-2.5 py-1.5 bg-error-bg/40 rounded text-[10px] text-error/80 space-y-0.5">
                  <div className="flex gap-3 flex-wrap">
                    <span>
                      Erwartet: <span className="font-medium">{a.erwartet}</span>
                    </span>
                    <span>
                      Gefunden: <span className="font-medium">{a.gefunden}</span>
                    </span>
                  </div>
                  <div className="text-error/60">
                    {a.dokument} · {a.schwere}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {abgleich.ki_zusammenfassung && (
        <p className="text-[11px] text-foreground-muted mt-2 leading-relaxed">
          {abgleich.ki_zusammenfassung}
        </p>
      )}
    </div>
  );
}
