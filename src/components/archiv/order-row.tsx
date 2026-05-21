/**
 * OrderRow — eine archivierte Bestellungs-Zeile + expandable Detail-Block.
 * Aus archiv-client.tsx extrahiert (11.05.2026).
 */

import Link from "next/link";
import { formatDatum, formatBetrag } from "@/lib/formatters";
import { DOKUMENT_CONFIG, displayBestellnummer } from "@/lib/bestellung-utils";
import { bestellerDisplay } from "@/lib/besteller-display";
import { DokumentIcon } from "@/components/ui/cells/dokument-icon";
import type { Dokument, PaidBestellung } from "./types";

export interface OrderRowProps {
  order: PaidBestellung;
  docs: Dokument[];
  dokConfig: typeof DOKUMENT_CONFIG.material;
  isExpanded: boolean;
  toggleExpand: (id: string) => void;
  type: "material" | "subunternehmer";
  istAdmin: boolean;
  isOdd: boolean;
  selectionMode?: boolean;
  isSelected?: boolean;
  toggleSelect?: (id: string) => void;
}

export function OrderRow({
  order,
  docs,
  dokConfig,
  isExpanded,
  toggleExpand,
  type,
  istAdmin,
  isOdd,
  selectionMode = false,
  isSelected = false,
  toggleSelect,
}: OrderRowProps) {
  return (
    <>
      <tr
        className={`table-row-hover border-b border-line-subtle ${isOdd ? "bg-zebra" : ""} ${isSelected ? "bg-brand/[0.03]" : ""}`}
        onClick={() => toggleExpand(order.id)}
      >
        {selectionMode && (
          <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelect?.(order.id)}
              className="w-4 h-4 rounded border-line-strong text-brand focus:ring-brand/20 cursor-pointer"
            />
          </td>
        )}
        <td className="px-4 py-3.5">
          <span className="font-mono-amount font-semibold text-brand">{displayBestellnummer(order)}</span>
        </td>
        <td className="px-4 py-3.5 text-foreground">
          <span className="flex items-center gap-1.5">
            {type === "subunternehmer"
              ? order.subunternehmer_firma || order.haendler_name || "–"
              : order.haendler_name || "–"}
            {type === "subunternehmer" && order.subunternehmer_gewerk && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold tracking-wide bg-warning-bg text-warning rounded uppercase">
                {order.subunternehmer_gewerk}
              </span>
            )}
          </span>
        </td>
        {istAdmin && (
          <td className="px-4 py-3.5 text-foreground-muted hidden lg:table-cell">
            {bestellerDisplay(order.besteller_kuerzel, order.besteller_name, order.bestellungsart).name}
          </td>
        )}
        <td className="px-4 py-3.5 hidden md:table-cell">
          {order.projekt_name ? (
            <span className="text-xs text-foreground-muted">{order.projekt_name}</span>
          ) : (
            <span className="text-line-strong">–</span>
          )}
        </td>
        {dokConfig.map((dok) => {
          const hasDoc = order[dok.flag as keyof PaidBestellung] as boolean;
          return (
            <td key={dok.flag} className="px-3 py-3.5 text-center hidden sm:table-cell">
              <div className="flex justify-center">
                <DokumentIcon vorhanden={hasDoc} label={dok.label} />
              </div>
            </td>
          );
        })}
        <td className="px-4 py-3.5 text-right">
          <span className="font-mono-amount font-semibold text-foreground">
            {formatBetrag(Number(order.betrag))}
          </span>
        </td>
        <td className="px-4 py-3.5">
          <div className="flex flex-col">
            <span className="text-[12px] text-foreground-muted">{formatDatum(order.bezahlt_am)}</span>
            {order.bezahlt_von && (
              <span className="text-[10px] text-foreground-faint">{order.bezahlt_von}</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3.5 text-center">
          <svg
            className={`w-4 h-4 text-foreground-faint transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </td>
      </tr>

      {/* Expanded row */}
      {isExpanded && (
        <tr>
          <td colSpan={20} className="p-0">
            <div className="bg-input border-b border-line px-6 py-4">
              <div className="flex items-start justify-between gap-6">
                {/* Documents */}
                <div className="flex-1">
                  <p className="text-[10px] text-foreground-subtle uppercase tracking-widest font-semibold mb-2">
                    Dokumente
                  </p>
                  {docs.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {docs.map((dok) => (
                        <div
                          key={dok.id}
                          className="flex items-center gap-2 px-3 py-2 bg-surface rounded-lg border border-line"
                        >
                          <svg
                            className="w-3.5 h-3.5 text-foreground-subtle"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                            />
                          </svg>
                          <span className="text-xs font-medium text-foreground capitalize">{dok.typ}</span>
                          {dok.gesamtbetrag != null && (
                            <span className="font-mono-amount text-[12px] text-foreground-muted">
                              {formatBetrag(dok.gesamtbetrag)}
                            </span>
                          )}
                          {dok.storage_pfad && (
                            <a
                              href={`/api/pdfs/${dok.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="p-0.5 rounded text-foreground-subtle hover:text-brand transition-colors"
                              title="PDF ansehen"
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={1.5}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                                />
                              </svg>
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-foreground-faint">Keine Dokumente vorhanden</span>
                  )}
                </div>

                {/* Action */}
                <Link
                  href={`/bestellungen/${order.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-brand hover:text-brand-light font-medium border border-line rounded-lg hover:bg-surface transition-colors shrink-0 group/link"
                >
                  Details
                  <svg
                    className="w-3 h-3 transition-transform group-hover/link:translate-x-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </Link>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
