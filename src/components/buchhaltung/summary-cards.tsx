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
  /** 12.10.2026 — naechster Zahlungslauf (lib/zahlungslauf.ts). */
  zahlungslauf?: { datum: string; anzahl: number; summe: number; ueberfaellig: number };
  onZahlungslauf?: () => void;
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
  zahlungslauf,
  onZahlungslauf,
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
      {zahlungslauf ? (
        // 12.10.2026 — Der Zahlungslauf ersetzt "Naechste Faellig": die
        // Frage ist nicht, wann die naechste Rechnung faellig ist, sondern
        // was am Zahltag ueberwiesen wird. Klick springt in den Reiter.
        <button
          type="button"
          onClick={onZahlungslauf}
          className="card card-hover p-5 relative overflow-hidden text-left focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          style={{ borderTop: "3px solid var(--feedback-warning)" }}
          title="Zum Zahlungslauf"
        >
          <div
            className="absolute top-0 left-0 right-0 h-8 opacity-[0.06]"
            style={{ background: "linear-gradient(180deg, var(--feedback-warning), transparent)" }}
          />
          <p className="text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase relative">
            Zahlungslauf {formatDatum(zahlungslauf.datum)}
          </p>
          <p className="font-mono-amount text-h2 font-bold text-foreground mt-2 relative">
            {EUR.format(zahlungslauf.summe)}
          </p>
          <p className="text-[12px] text-foreground-subtle mt-1 relative">
            {zahlungslauf.anzahl} Rechnung{zahlungslauf.anzahl !== 1 ? "en" : ""}
            {zahlungslauf.ueberfaellig > 0 && (
              <span className="text-error font-semibold"> · {zahlungslauf.ueberfaellig} überfällig</span>
            )}
            {naechsteFaelligDatum && ` · nächste Fälligkeit ${formatDatum(naechsteFaelligDatum)}`}
          </p>
        </button>
      ) : (
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
      )}
    </div>
  );
}
