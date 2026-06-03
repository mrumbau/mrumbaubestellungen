/**
 * BetragCell — formatierter Geldbetrag für Tabellen-Zellen.
 *
 * Wrapper um `formatBetrag()` plus optional ein "netto"-Indikator-Badge.
 *
 * Vorher in bestellungen-tabelle.tsx und archiv-client.tsx separat
 * implementiert (mit leichten Variationen beim netto-Badge).
 *
 * 03.06.2026 (Phase 1 Quick Wins): "0,00 €" wird jetzt visuell gedämpft
 * gerendert + Tooltip — sonst nicht von "echtem" Betrag unterscheidbar.
 * Ein "—" (null) bedeutet: noch nicht extrahiert. Ein "0,00 €" bedeutet:
 * Pipeline hat 0 erkannt (z. B. Gratis-Sample, Gutschein-Eintrag).
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
  if (numBetrag === 0) {
    return (
      <span
        className="text-foreground-subtle"
        title="Betrag wurde mit 0 erkannt (z. B. Gratis-Sample, Gutschein-Position) — kein fehlender Wert."
      >
        {formatBetrag(0, waehrung ?? undefined)}
        {istNetto && (
          <span className="text-[10px] text-foreground-faint ml-1">netto</span>
        )}
      </span>
    );
  }
  if (numBetrag == null) {
    return (
      <span
        className="text-foreground-faint"
        title="Betrag wurde noch nicht aus dem Dokument extrahiert."
      >
        —
      </span>
    );
  }
  return (
    <>
      {formatBetrag(numBetrag, waehrung ?? undefined)}
      {istNetto && (
        <span className="text-[10px] text-foreground-subtle ml-1">netto</span>
      )}
    </>
  );
}
