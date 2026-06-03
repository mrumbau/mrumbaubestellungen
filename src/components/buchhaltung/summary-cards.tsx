// TODO text-scale (UX-R1 codemod, 03.06.2026): 1× approx-map review: text-3xl→text-h1 (war 30px, jetzt 28px)
"use client";

/**
 * Summary-Cards für Buchhaltung — Bento-Layout (DESIGN-Critique #3).
 *
 * "Offene Rechnungen" ist die einzige Karte, auf die NJ täglich morgens
 * schaut — sie wird als Hero (md:col-span-2) hervorgehoben, "Bezahlt" und
 * "Nächste Fällig" als Standard-Kacheln. Bei summeOffen > 0 zusätzlich
 * alert-Tönung (impeccable Anti-Pattern "identical card grid" gebrochen).
 *
 * 12.05.2026 (Bento-Refactor).
 */

import { formatDatum } from "@/lib/formatters";
import { HeroStatCard } from "@/components/ui/hero-stat-card";

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
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <HeroStatCard
        label="Offene Rechnungen"
        value={EUR.format(summeOffen)}
        color="var(--mr-red)"
        badge={offeneCount > 0 ? "Aktion" : undefined}
        footer={
          <p className="text-[12px] text-foreground-subtle">
            {offeneCount} Rechnung{offeneCount !== 1 ? "en" : ""} warten auf Freigabe
          </p>
        }
      />
      <div
        className="card card-hover p-5 relative overflow-hidden"
        style={{ borderTop: "3px solid var(--status-freigegeben)" }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-8 opacity-[0.06]"
          style={{ background: "linear-gradient(180deg, var(--status-freigegeben), transparent)" }}
        />
        <p className="text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase relative">
          Bezahlt
        </p>
        <p className="font-mono-amount text-h1 font-bold text-foreground mt-2 relative">
          {EUR.format(summeBezahlt)}
        </p>
        <p className="text-[12px] text-foreground-subtle mt-1 relative">
          {bezahlteCount} Rechnung{bezahlteCount !== 1 ? "en" : ""}
        </p>
      </div>
      <div
        className="card card-hover p-5 relative overflow-hidden"
        style={{ borderTop: "3px solid var(--feedback-warning)" }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-8 opacity-[0.06]"
          style={{ background: "linear-gradient(180deg, var(--feedback-warning), transparent)" }}
        />
        <p className="text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase relative">
          Nächste Fällig
        </p>
        <p className="font-mono-amount text-h2 font-bold text-foreground mt-2 relative">
          {naechsteFaelligDatum ? formatDatum(naechsteFaelligDatum) : "–"}
        </p>
        <p className="text-[12px] text-foreground-subtle mt-1 relative">
          Monat: {EUR.format(summeMonat)}
        </p>
      </div>
    </div>
  );
}
