"use client";

/**
 * BuchhaltungTable — die Haupttabelle mit Bezahlt-Toggle pro Reihe.
 *
 * Aus buchhaltung-client.tsx extrahiert (12.05.2026, F4.7 Sprint 2).
 * Pro Reihe: Bestellnr, Händler, BB/LS-Icons, Betrag, Freigabe-Info,
 * Fälligkeit (rot/gelb je nach Status), Bezahlt-Toggle, PDF-Link.
 */

import { formatDatum, formatBetrag } from "@/lib/formatters";
import { haendlerDisplay } from "@/lib/haendler-display";
import { type BuchhaltungRow, isFaelligBald, isUeberfaellig } from "./types";

export interface BuchhaltungTableProps {
  paginatedRows: BuchhaltungRow[];
  aktiveRows: BuchhaltungRow[];
  tab: "offen" | "bezahlt";
  selectionMode: boolean;
  selectedIds: Set<string>;
  gefiltert: BuchhaltungRow[];
  onToggleSelectAll: () => void;
  onToggleSelect: (id: string) => void;
  kannBezahlen: boolean;
  bezahltLoading: string | null;
  archivLoading: boolean;
  onToggleBezahlt: (id: string, aktuellBezahlt: boolean) => void;
  onArchivieren: (ids: string[]) => void;
  /**
   * 12.05.2026 (Continuity-Patch): Set der gerade bulk-bezahlten IDs.
   * Rows bekommen 1.2s Success-Green-Flash bevor der Refresh sie ggf.
   * aus der "offen"-Liste in "bezahlt" verschiebt.
   */
  successFlashIds?: Set<string>;
}

export function BuchhaltungTable({
  paginatedRows,
  aktiveRows,
  tab,
  selectionMode,
  selectedIds,
  gefiltert,
  onToggleSelectAll,
  onToggleSelect,
  kannBezahlen,
  bezahltLoading,
  archivLoading,
  onToggleBezahlt,
  onArchivieren,
  successFlashIds,
}: BuchhaltungTableProps) {
  return (
    <div className="mt-4 card overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="bg-input border-b border-line sticky top-0 z-10">
            {selectionMode && (
              <th className="px-3 py-3.5 w-10">
                <input
                  type="checkbox"
                  checked={gefiltert.length > 0 && selectedIds.size === gefiltert.length}
                  onChange={onToggleSelectAll}
                  className="w-4 h-4 rounded border-line-strong text-brand focus:ring-brand/20 cursor-pointer"
                />
              </th>
            )}
            <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase">
              Bestellnr.
            </th>
            <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase">
              Händler / SU
            </th>
            <th className="px-4 py-3.5 text-center font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase">
              Best.
            </th>
            <th className="px-4 py-3.5 text-center font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase">
              LS
            </th>
            <th className="px-4 py-3.5 text-right font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase">
              Betrag
            </th>
            <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase">
              Freigegeben von
            </th>
            <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase">
              Freigegeben am
            </th>
            <th className="px-4 py-3.5 text-left font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase">
              Fällig
            </th>
            <th className="px-4 py-3.5 text-center font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase">
              {tab === "offen" ? "Bezahlt" : "Bezahlt am"}
            </th>
            <th className="px-4 py-3.5 text-center font-semibold text-[10px] text-foreground-subtle tracking-widest uppercase">
              PDF
            </th>
          </tr>
        </thead>
        <tbody>
          {paginatedRows.length === 0 ? (
            <tr>
              <td
                colSpan={selectionMode ? 11 : 10}
                className="px-4 py-12 text-center text-foreground-subtle"
              >
                {aktiveRows.length === 0
                  ? tab === "offen"
                    ? "Keine offenen Rechnungen."
                    : "Noch keine bezahlten Rechnungen."
                  : "Keine Rechnungen gefunden."}
              </td>
            </tr>
          ) : (
            paginatedRows.map((r, i) => (
              <tr
                key={r.id}
                data-row-id={r.id}
                className={`table-row-hover border-b border-line-subtle ${i % 2 === 1 ? "bg-zebra" : ""} ${selectedIds.has(r.id) ? "bg-brand/[0.03]" : ""} ${successFlashIds?.has(r.id) ? "row-bulk-success-flash" : ""}`}
              >
                {selectionMode && (
                  <td className="px-3 py-3.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={() => onToggleSelect(r.id)}
                      className="w-4 h-4 rounded border-line-strong text-brand focus:ring-brand/20 cursor-pointer"
                    />
                  </td>
                )}
                <td className="px-4 py-3.5">
                  <span className="font-mono-amount font-semibold text-brand">
                    {r.bestellnummer || "–"}
                    {r.mahnung_am && (
                      <span
                        className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-error-bg text-error text-[10px] font-semibold"
                        title={`Mahnung eingegangen am ${new Date(r.mahnung_am).toLocaleDateString("de-DE")}`}
                      >
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 15.75h.007v.008H12v-.008z"
                          />
                        </svg>
                        {r.mahnung_count && r.mahnung_count > 1
                          ? `${r.mahnung_count}. Mahnung`
                          : "Mahnung"}
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-foreground">
                  <span className="flex items-center gap-1.5">
                    {(() => {
                      const hd = haendlerDisplay(r.haendler_name);
                      return (
                        <>
                          <span>{hd.name}</span>
                          {hd.isUnsicher && (
                            <span
                              aria-hidden="true"
                              title="Pipeline hat den Lieferanten nicht eindeutig erkannt."
                              className="inline-flex items-center justify-center h-3 w-3 rounded-full bg-warning-bg text-warning text-[8px] font-bold font-mono-amount"
                            >
                              ?
                            </span>
                          )}
                        </>
                      );
                    })()}
                    {r.bestellungsart === "subunternehmer" && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold tracking-wide bg-bestellungsart-subunternehmer-bg text-bestellungsart-subunternehmer-text rounded">
                        SUB
                      </span>
                    )}
                    {r.ist_gutschrift && (
                      <span
                        className="px-1.5 py-0.5 text-[10px] font-bold tracking-wide bg-success-bg text-success rounded border border-success-border"
                        title="Gutschrift / Rückerstattung — Geld kommt zurück an MR Umbau, kein Soll-Posten."
                      >
                        GUTSCHRIFT
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  {r.bestellungsart === "subunternehmer" ? (
                    <span className="text-line-strong text-xs">–</span>
                  ) : r.hat_bestellbestaetigung ? (
                    <svg
                      className="w-4 h-4 text-success mx-auto"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-line-strong mx-auto" />
                  )}
                </td>
                <td className="px-4 py-3.5 text-center">
                  {r.bestellungsart === "subunternehmer" ? (
                    <span className="text-line-strong text-xs">–</span>
                  ) : r.hat_lieferschein ? (
                    <svg
                      className="w-4 h-4 text-success mx-auto"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-line-strong mx-auto" />
                  )}
                </td>
                <td className="px-4 py-3.5 text-right">
                  <span
                    className={`font-mono-amount font-semibold ${
                      r.ist_gutschrift ? "text-success" : "text-foreground"
                    }`}
                  >
                    {r.ist_gutschrift ? "+ " : ""}
                    {formatBetrag(r.betrag, r.waehrung)}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-foreground-muted">{r.freigegeben_von}</td>
                <td className="px-4 py-3.5 text-foreground-subtle text-xs">
                  {formatDatum(r.freigegeben_am)}
                </td>
                <td className="px-4 py-3.5">
                  <span
                    className={
                      isUeberfaellig(r.faelligkeitsdatum)
                        ? "text-error font-semibold font-mono-amount text-xs pulse-urgent"
                        : isFaelligBald(r.faelligkeitsdatum)
                          ? "text-warning font-semibold font-mono-amount text-xs"
                          : "text-foreground-subtle text-xs"
                    }
                  >
                    {formatDatum(r.faelligkeitsdatum)}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-center">
                  {tab === "bezahlt" ? (
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[12px] text-success font-medium">
                        {formatDatum(r.bezahlt_am)}
                      </span>
                      <span className="text-[10px] text-foreground-subtle">{r.bezahlt_von}</span>
                      {kannBezahlen && (
                        <div className="flex items-center justify-center gap-1.5 mt-1">
                          <button
                            type="button"
                            onClick={() => onArchivieren([r.id])}
                            disabled={archivLoading}
                            className="p-1 rounded text-foreground-subtle hover:text-brand hover:bg-brand/[0.06] transition-colors"
                            title="Ins Archiv verschieben"
                          >
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleBezahlt(r.id, true)}
                            disabled={bezahltLoading === r.id}
                            className="p-1 rounded text-line-strong hover:text-error hover:bg-error-bg transition-colors"
                            title="Zahlung zurücksetzen"
                          >
                            {bezahltLoading === r.id ? (
                              <span className="text-[10px]">...</span>
                            ) : (
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
                                />
                              </svg>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : kannBezahlen ? (
                    <button
                      type="button"
                      onClick={() => onToggleBezahlt(r.id, false)}
                      disabled={bezahltLoading === r.id}
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-md border-2 transition-all border-line-strong hover:border-success text-transparent hover:text-success ${
                        bezahltLoading === r.id ? "opacity-50 cursor-wait" : "cursor-pointer"
                      }`}
                      title="Als bezahlt markieren"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  ) : (
                    <span className="inline-flex items-center justify-center w-6 h-6 text-line-strong">
                      –
                    </span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-center">
                  {r.rechnung_id ? (
                    <a
                      href={`/api/pdfs/${r.rechnung_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center text-brand hover:text-brand-light transition-colors"
                      title="PDF herunterladen"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 10v6m0 0l-3-3m3 3l3-3M6 20h12a2 2 0 002-2V8l-6-6H6a2 2 0 00-2 2v14a2 2 0 002 2z"
                        />
                      </svg>
                    </a>
                  ) : (
                    <span className="text-line-strong">–</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
