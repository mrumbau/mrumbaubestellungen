"use client";

/**
 * Summary-Cards für Buchhaltung — 3 KPI-Kacheln (Offen / Bezahlt / Nächste Fällig).
 * Aus buchhaltung-client.tsx extrahiert (12.05.2026, F4.7 Sprint 2).
 */

import { formatDatum } from "@/lib/formatters";

export interface BuchhaltungSummaryCardsProps {
  summeOffen: number;
  offeneCount: number;
  summeBezahlt: number;
  bezahlteCount: number;
  naechsteFaelligDatum: string | null;
  summeMonat: number;
}

const EUR = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

export function BuchhaltungSummaryCards({
  summeOffen,
  offeneCount,
  summeBezahlt,
  bezahlteCount,
  naechsteFaelligDatum,
  summeMonat,
}: BuchhaltungSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div
        className="card card-hover p-5 relative overflow-hidden"
        style={{ borderTop: "3px solid #570006" }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-8 opacity-[0.06]"
          style={{ background: "linear-gradient(180deg, #570006, transparent)" }}
        />
        <p className="text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase relative">
          Offene Rechnungen
        </p>
        <p className="font-mono-amount text-3xl font-bold text-foreground mt-2 relative">
          {EUR.format(summeOffen)}
        </p>
        <p className="text-[11px] text-foreground-subtle mt-1 relative">
          {offeneCount} Rechnung{offeneCount !== 1 ? "en" : ""}
        </p>
      </div>
      <div
        className="card card-hover p-5 relative overflow-hidden"
        style={{ borderTop: "3px solid #059669" }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-8 opacity-[0.06]"
          style={{ background: "linear-gradient(180deg, #059669, transparent)" }}
        />
        <p className="text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase relative">
          Bezahlt
        </p>
        <p className="font-mono-amount text-3xl font-bold text-foreground mt-2 relative">
          {EUR.format(summeBezahlt)}
        </p>
        <p className="text-[11px] text-foreground-subtle mt-1 relative">
          {bezahlteCount} Rechnung{bezahlteCount !== 1 ? "en" : ""}
        </p>
      </div>
      <div
        className="card card-hover p-5 relative overflow-hidden"
        style={{ borderTop: "3px solid #d97706" }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-8 opacity-[0.06]"
          style={{ background: "linear-gradient(180deg, #d97706, transparent)" }}
        />
        <p className="text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase relative">
          Nächste Fällig
        </p>
        <p className="font-mono-amount text-3xl font-bold text-foreground mt-2 relative">
          {naechsteFaelligDatum ? formatDatum(naechsteFaelligDatum) : "–"}
        </p>
        <p className="text-[11px] text-foreground-subtle mt-1 relative">
          Diesen Monat: {EUR.format(summeMonat)}
        </p>
      </div>
    </div>
  );
}
