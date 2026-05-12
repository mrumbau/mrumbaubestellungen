"use client";

/**
 * useBestellungColumns — Column-Definitions für die Bestellungen-Tabelle.
 * Aus bestellungen-tabelle.tsx extrahiert (12.05.2026, F3.3 Decomposition).
 *
 * Closure-Deps:
 *   - projektFarbenMap: für Projekt-Farb-Dots in Händler-Cell + Projekt-Spalte
 *   - freigabeLoadingId: zum Disablen des Quick-Freigabe-Buttons während async
 *   - handlePreview / preloadPreview: PDF-Preview-Modal-Trigger
 *   - setFreigabeConfirmId: öffnet Quick-Freigabe-Confirm-Dialog
 */

import { useMemo } from "react";
import Link from "next/link";
import { formatDatum } from "@/lib/formatters";
import { displayBestellnummer } from "@/lib/bestellung-utils";
import { DokumentIcon } from "@/components/ui/cells/dokument-icon";
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
        key: "bestellnummer",
        label: "Bestellnr.",
        sortable: true,
        stopPropagation: true,
        render: (b) => (
          <Link
            href={`/bestellungen/${b.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-mono-amount font-semibold text-brand hover:text-brand-light transition-colors"
          >
            {displayBestellnummer(b)}
            {b.mahnung_am && (
              <span
                className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-error-bg text-error text-[10px] font-semibold"
                title={`Mahnung eingegangen am ${new Date(b.mahnung_am).toLocaleDateString("de-DE")}`}
              >
                <IconAlertCircle className="w-3 h-3" />
                {b.mahnung_count && b.mahnung_count > 1
                  ? `${b.mahnung_count}. Mahnung`
                  : "Mahnung"}
              </span>
            )}
          </Link>
        ),
      },
      {
        key: "haendler_name",
        label: "Händler / Firma",
        sortable: true,
        render: (b) => {
          const artValue = b.bestellungsart || "material";
          const isSub = artValue === "subunternehmer";
          const isAbo = artValue === "abo";
          return (
            <>
              <div className="flex items-center gap-2">
                <span className="truncate max-w-[150px]">{b.haendler_name || "–"}</span>
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
                <div className="lg:hidden mt-1 flex items-center gap-1.5 text-[12px] text-foreground-muted">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                      background:
                        projektFarbenMap.get(b.projekt_id!) || "var(--mr-red)",
                    }}
                  />
                  {b.projekt_name}
                </div>
              )}
            </>
          );
        },
      },
      {
        key: "projekt_name",
        label: "Projekt",
        hideBelow: "lg",
        render: (b) =>
          b.projekt_name ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-foreground max-w-[120px]">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  background:
                    projektFarbenMap.get(b.projekt_id!) || "var(--mr-red)",
                }}
              />
              <span className="truncate">{b.projekt_name}</span>
            </span>
          ) : (
            <span className="text-line-strong text-[12px]">–</span>
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
        key: "hat_bestellbestaetigung",
        label: "Best.",
        align: "center",
        hideBelow: "sm",
        stopPropagation: true,
        render: (b) => {
          const artValue = b.bestellungsart || "material";
          if (artValue === "subunternehmer" || artValue === "abo") {
            return <span className="text-line-strong">–</span>;
          }
          return (
            <div className="flex justify-center">
              <DokumentIcon
                vorhanden={b.hat_bestellbestaetigung}
                onClick={
                  b.hat_bestellbestaetigung
                    ? (e) => {
                        e.stopPropagation();
                        handlePreview(b.id, "bestellbestaetigung");
                      }
                    : undefined
                }
                onMouseEnter={
                  b.hat_bestellbestaetigung
                    ? () => preloadPreview(b.id, "bestellbestaetigung")
                    : undefined
                }
              />
            </div>
          );
        },
      },
      {
        key: "hat_lieferschein",
        label: "LS",
        align: "center",
        hideBelow: "sm",
        stopPropagation: true,
        render: (b) => {
          const artValue = b.bestellungsart || "material";
          if (artValue === "subunternehmer" || artValue === "abo") {
            return <span className="text-line-strong">–</span>;
          }
          return (
            <div className="flex justify-center">
              <DokumentIcon
                vorhanden={b.hat_lieferschein}
                onClick={
                  b.hat_lieferschein
                    ? (e) => {
                        e.stopPropagation();
                        handlePreview(b.id, "lieferschein");
                      }
                    : undefined
                }
                onMouseEnter={
                  b.hat_lieferschein
                    ? () => preloadPreview(b.id, "lieferschein")
                    : undefined
                }
              />
            </div>
          );
        },
      },
      {
        key: "hat_rechnung",
        label: "RE",
        align: "center",
        hideBelow: "sm",
        stopPropagation: true,
        render: (b) => (
          <div className="flex justify-center">
            <DokumentIcon
              vorhanden={b.hat_rechnung}
              onClick={
                b.hat_rechnung
                  ? (e) => {
                      e.stopPropagation();
                      handlePreview(b.id, "rechnung");
                    }
                  : undefined
              }
              onMouseEnter={
                b.hat_rechnung ? () => preloadPreview(b.id, "rechnung") : undefined
              }
            />
          </div>
        ),
      },
      {
        key: "hat_versandbestaetigung",
        label: "VS",
        align: "center",
        hideBelow: "sm",
        stopPropagation: true,
        render: (b) => {
          const artValue = b.bestellungsart || "material";
          if (artValue === "subunternehmer" || artValue === "abo") {
            return <span className="text-line-strong">–</span>;
          }
          return (
            <div className="flex justify-center">
              <DokumentIcon
                vorhanden={b.hat_versandbestaetigung ?? false}
                onClick={
                  b.hat_versandbestaetigung
                    ? (e) => {
                        e.stopPropagation();
                        handlePreview(b.id, "versandbestaetigung");
                      }
                    : undefined
                }
                onMouseEnter={
                  b.hat_versandbestaetigung
                    ? () => preloadPreview(b.id, "versandbestaetigung")
                    : undefined
                }
              />
            </div>
          );
        },
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (b) => <StatusCell status={b.status} />,
      },
      {
        key: "betrag",
        label: "Betrag",
        sortable: true,
        align: "right",
        className: "font-mono-amount font-semibold",
        render: (b) => <BetragCell betrag={b.betrag} waehrung={b.waehrung} istNetto={b.betrag_ist_netto} />,
      },
      {
        key: "actions",
        label: "",
        stopPropagation: true,
        width: 48,
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
