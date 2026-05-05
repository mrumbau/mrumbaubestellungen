/**
 * BetragCell — formatierter Geldbetrag für Tabellen-Zellen.
 *
 * Wrapper um `formatBetrag()` plus optional ein "netto"-Indikator-Badge.
 *
 * Vorher in bestellungen-tabelle.tsx und archiv-client.tsx separat
 * implementiert (mit leichten Variationen beim netto-Badge).
 */

import { formatBetrag } from "@/lib/formatters";

export interface BetragCellProps {
  betrag: number | null | undefined;
  waehrung?: string | null;
  /** Wenn true und betrag != null: kleines "netto"-Badge anzeigen */
  istNetto?: boolean;
}

export function BetragCell({ betrag, waehrung, istNetto }: BetragCellProps) {
  // Number-Cast falls aus DB als String kommt (numeric → string)
  const numBetrag = typeof betrag === "string" ? Number(betrag) : (betrag ?? null);
  return (
    <>
      {formatBetrag(numBetrag, waehrung ?? undefined)}
      {istNetto && numBetrag != null && (
        <span className="text-[10px] text-foreground-subtle ml-1">netto</span>
      )}
    </>
  );
}
