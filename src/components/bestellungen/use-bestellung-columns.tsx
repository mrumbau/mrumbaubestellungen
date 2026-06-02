"use client";

/**
 * useBestellungColumns — Column-Definitions für die Bestellungen-Tabelle.
 *
 * 02.06.2026 (UI-Polish nach Pool-Reform):
 *   - **Primary-Spalte konsolidiert**: Bestellnummer + Händler + Projekt-Sub-Row
 *     in EINER Spalte (analog GitHub-PR-Pattern). Vorher 3 separate Spalten
 *     mit unbalanciertem Whitespace, Projekt fast immer leer.
 *   - **Neue Besteller-Spalte**: BestellerCell pill-only — Pool-Reform endlich
 *     in der Liste sichtbar. Pipeline-Vorschlag als Ghost-Pill direkt erkennbar.
 *   - **4 Doku-Spalten → 1 DokumenteCell**: Inline-Slots mit B/L/R/V-Letters
 *     spart ~210px Tabellen-Breite, gleiche Information.
 *   - **Aktion-Header benannt**: vorher "" → "Aktion", Screen-Reader-fair.
 *
 * Closure-Deps:
 *   - projektFarbenMap: Projekt-Color-Dots
 *   - freigabeLoadingId: Disable Quick-Freigabe während async
 *   - handlePreview / preloadPreview: PDF-Preview-Modal-Trigger
 *   - setFreigabeConfirmId: Quick-Freigabe-Confirm-Dialog
 */

import { useMemo } from "react";
import Link from "next/link";
import { formatDatum } from "@/lib/formatters";
import { displayBestellnummer } from "@/lib/bestellung-utils";
import { BestellerCell } from "@/components/ui/cells/besteller-cell";
import { DokumenteCell } from "@/components/ui/cells/dokumente-cell";
import { StatusCell } from "@/components/ui/cells/status-cell";
import { BetragCell } from "@/components/ui/cells/betrag-cell";
import { Badge, type DataTableColumn } from "@/components/ui";
import { IconCheck, IconAlertCircle } from "@/components/ui/icons";
import type { Bestellung } from "./types";

export interface UseBestellungColumnsOptions {
  projektFarbenMap: Map<string, string>;
  freigabeLoadingId: string | null;
  handlePreview: (bestellungId: string, typ: string) => void;
  preloadPreview: (bestellungId: string, typ: string) => void;
  setFreigabeConfirmId: (id: string | null) => void;
}

export function useBestellungColumns({
  projektFarbenMap,
  freigabeLoadingId,
  handlePreview,
  preloadPreview,
  setFreigabeConfirmId,
}: UseBestellungColumnsOptions): DataTableColumn<Bestellung>[] {
  return useMemo(
    () => [
      {
        // Primary-Spalte: Bestellnummer + Händler + (optional) Projekt-Sub-Row.
        // GitHub-PR-Pattern: das Wichtigste oben, Kontext darunter. Spart eine
        // separate Händler- und Projekt-Spalte.
        key: "bestellnummer",
        label: "Bestellung",
        sortable: true,
        stopPropagation: true,
        render: (b) => {
          const artValue = b.bestellungsart || "material";
          const isSub = artValue === "subunternehmer";
          const isAbo = artValue === "abo";
          const haendlerLabel = b.haendler_name || "–";
          return (
            <div className="flex flex-col gap-0.5 min-w-0 max-w-[280px]">
              <Link
                href={`/bestellungen/${b.id}`}
                // 22.05.2026 (Perf) — kein RSC-Prefetch-Storm.
                prefetch={false}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 font-mono-amount font-semibold text-brand hover:text-brand-light transition-colors truncate"
                title={displayBestellnummer(b)}
              >
                <span className="truncate">{displayBestellnummer(b)}</span>
                {b.mahnung_am && (
                  <span
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-error-bg text-error text-[10px] font-semibold shrink-0"
                    title={`Mahnung eingegangen am ${new Date(b.mahnung_am).toLocaleDateString("de-DE")}`}
                  >
                    <IconAlertCircle className="w-3 h-3" />
                    {b.mahnung_count && b.mahnung_count > 1
                      ? `${b.mahnung_count}. Mahnung`
                      : "Mahnung"}
                  </span>
                )}
              </Link>
              <div className="flex items-center gap-2 text-[12px] text-foreground-muted min-w-0">
                <span className="truncate" title={haendlerLabel}>
                  {haendlerLabel}
                </span>
                {isSub && (
                  <Badge tone="warning" size="sm">
                    SUB
                  </Badge>
                )}
                {isAbo && (
                  <Badge tone="info" size="sm">
                    ABO
                  </Badge>
                )}
              </div>
              {b.projekt_name && (
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-foreground-subtle min-w-0">
                  <span
                    aria-hidden="true"
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                      background: projektFarbenMap.get(b.projekt_id!) || "var(--mr-red)",
                    }}
                  />
                  <span className="truncate">{b.projekt_name}</span>
                </div>
              )}
            </div>
          );
        },
      },
      {
        // 02.06.2026 (Pool-Reform sichtbar machen). Pill-only Variante bleibt
        // kompakt; Drei-Sprachen-Disziplin trennt Owner / Vorschlag / Geteilt /
        // Unzugeordnet visuell. Auf Mobile (hideBelow="md") versteckt — dort
        // landet die Info im Sub-Detail-View. sortable: ja, damit der Pool
        // direkt nach UNBEKANNT gruppiert werden kann.
        key: "besteller_kuerzel",
        label: "Besteller",
        align: "center",
        sortable: true,
        hideBelow: "md",
        stopPropagation: true,
        render: (b) => (
          <BestellerCell
            besteller_kuerzel={b.besteller_kuerzel}
            besteller_name={b.besteller_name}
            bestellungsart={b.bestellungsart}
            vorschlag_kuerzel={b.vorschlag_kuerzel ?? null}
            vorschlag_konfidenz={b.vorschlag_konfidenz ?? null}
            variant="pill-only"
          />
        ),
      },
      {
        key: "created_at",
        label: "Datum",
        sortable: true,
        hideBelow: "md",
        className: "text-foreground-subtle whitespace-nowrap",
        // 06.05.2026 — bestelldatum (echtes Bestelldatum aus BB-Doku) bevorzugt
        // vor created_at (Pipeline-Erfassungszeitpunkt). Tooltip zeigt beide.
        render: (b) => {
          const echtBestellt = b.bestelldatum;
          if (echtBestellt) {
            return (
              <span title={`Bestellt am ${formatDatum(echtBestellt)} · Erfasst ${formatDatum(b.created_at)}`}>
                {formatDatum(echtBestellt)}
              </span>
            );
          }
          return formatDatum(b.created_at);
        },
      },
      {
        // Konsolidiert die 4 Doku-Spalten (BB/LS/RE/VS) in eine inline-Slot-Cell.
        // Spalt-Header bleibt sortierbar nach hat_rechnung (häufigste Sortierung
        // bei Bulk-Freigabe-Workflow), B/L/V wird wie heute via Click-on-Slot
        // direkt zur Vorschau geöffnet.
        key: "hat_rechnung",
        label: "Dokumente",
        align: "center",
        sortable: true,
        hideBelow: "sm",
        stopPropagation: true,
        render: (b) => (
          <DokumenteCell
            hat_bestellbestaetigung={b.hat_bestellbestaetigung}
            hat_lieferschein={b.hat_lieferschein}
            hat_rechnung={b.hat_rechnung}
            hat_versandbestaetigung={b.hat_versandbestaetigung}
            bestellungsart={b.bestellungsart}
            onPreview={(typ) => handlePreview(b.id, typ)}
            onPreload={(typ) => preloadPreview(b.id, typ)}
          />
        ),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (b) => <StatusCell status={b.status} istGutschrift={b.ist_gutschrift} />,
      },
      {
        key: "betrag",
        label: "Betrag",
        sortable: true,
        align: "right",
        className: "font-mono-amount font-semibold",
        render: (b) => (
          <BetragCell
            betrag={b.betrag}
            waehrung={b.waehrung}
            istNetto={b.betrag_ist_netto}
            istGutschrift={b.ist_gutschrift}
          />
        ),
      },
      {
        // 02.06.2026 — Header benannt für Screen-Reader-Fairness (vorher "").
        // Quick-Freigabe nur sichtbar wenn semantisch sinnvoll; sonst leerer Slot.
        key: "actions",
        label: "Aktion",
        stopPropagation: true,
        width: 56,
        align: "right",
        render: (b) => {
          const kannFreigeben = b.status !== "freigegeben" && b.hat_rechnung;
          if (!kannFreigeben) {
            return <span className="text-line-strong text-[12px]">–</span>;
          }
          const isLoading = freigabeLoadingId === b.id;
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFreigabeConfirmId(b.id);
              }}
              disabled={isLoading}
              title="Rechnung freigeben"
              aria-label={`Rechnung freigeben für ${displayBestellnummer(b)}`}
              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-foreground-muted hover:text-status-freigegeben hover:bg-success-bg transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <IconCheck className="w-4 h-4" />
            </button>
          );
        },
      },
    ],
    [
      projektFarbenMap,
      freigabeLoadingId,
      handlePreview,
      preloadPreview,
      setFreigabeConfirmId,
    ],
  );
}
