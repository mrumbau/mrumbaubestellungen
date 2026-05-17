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
  /**
   * 17.05.2026 — Gutschrift: Betrag wird grün + mit "+"-Prefix gerendert,
   * damit die Geld-Richtung (zurück zu MRU) auf einen Blick erkennbar ist.
   */
  istGutschrift?: boolean | null;
}

export function BetragCell({ betrag, waehrung, istNetto, istGutschrift }: BetragCellProps) {
  // Number-Cast falls aus DB als String kommt (numeric → string)
  const numBetrag = typeof betrag === "string" ? Number(betrag) : (betrag ?? null);
  if (istGutschrift && numBetrag != null) {
    return (
      <span className="text-success">
        + {formatBetrag(numBetrag, waehrung ?? undefined)}
        {istNetto && (
          <span className="text-[10px] text-foreground-subtle ml-1">netto</span>
        )}
      </span>
    );
  }
  return (
    <>
      {formatBetrag(numBetrag, waehrung ?? undefined)}
      {istNetto && numBetrag != null && (
        <span className="text-[10px] text-foreground-subtle ml-1">netto</span>
      )}
    </>
  );
}
