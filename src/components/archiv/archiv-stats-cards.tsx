// TODO text-scale (UX-R1 codemod, 03.06.2026): 1× approx-map review: text-3xl→text-h1 (war 30px, jetzt 28px)
/**
 * 4 Summary-Cards (Projekte / Material / SU / Volumen) — Bento-Layout.
 *
 * "Gesamtvolumen" ist die geschäftlich relevanteste Zahl (Brand-Color,
 * Currency, größer als Sub-Counts) → als Hero (md:col-span-2). Projekte /
 * Material / SU als Standard-Kacheln daneben (DESIGN-Critique #3).
 *
 * Magic-Hex-Colors auf CSS-Custom-Properties migriert (UI-Audit F1.4 fix —
 * "var(--mr-red)" für Brand, übrige semantisch differenzierend).
 */

import { formatBetrag } from "@/lib/formatters";
import { HeroStatCard } from "@/components/ui/hero-stat-card";

export interface ArchivStatsSummary {
  totalProjekte: number;
  totalMaterial: number;
  totalSU: number;
  totalVolumen: number;
}

const STANDARD_CARDS = [
  { label: "Projekte", key: "totalProjekte" as const, color: "var(--archiv-projekte)" },
  { label: "Material", key: "totalMaterial" as const, color: "var(--archiv-material)" },
  { label: "Subunternehmer", key: "totalSU" as const, color: "var(--archiv-su)" },
];

export function ArchivStatsCards({ summary }: { summary: ArchivStatsSummary }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      <HeroStatCard
        label="Gesamtvolumen"
        value={formatBetrag(summary.totalVolumen)}
        color="var(--mr-red)"
        footer={
          <p className="text-[12px] text-foreground-subtle">
            Über {summary.totalProjekte} Projekte und {summary.totalMaterial + summary.totalSU} Aufträge
          </p>
        }
      />
      {STANDARD_CARDS.map((card) => {
        const value = summary[card.key];
        return (
          <div
            key={card.label}
            className="card card-hover p-5 relative overflow-hidden"
            style={{ borderTop: `3px solid ${card.color}` }}
          >
            <div
              className="absolute top-0 left-0 right-0 h-8 opacity-[0.06]"
              style={{
                background: `linear-gradient(180deg, ${card.color}, transparent)`,
              }}
            />
            <p className="text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase relative">
              {card.label}
            </p>
            <p className="font-mono-amount text-h1 font-bold text-foreground mt-2 relative">
              {value}
            </p>
          </div>
        );
      })}
    </div>
  );
}
