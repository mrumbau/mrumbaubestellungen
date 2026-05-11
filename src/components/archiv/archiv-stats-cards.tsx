/**
 * 4 Summary-Cards (Projekte / Material / SU / Volumen).
 * Aus archiv-client.tsx extrahiert (11.05.2026).
 *
 * Magic-Hex-Colors auf CSS-Custom-Properties migriert (UI-Audit F1.4 fix —
 * "var(--mr-red)" für Brand, übrige bleiben semantisch differenzierend).
 */

import { formatBetrag } from "@/lib/formatters";

export interface ArchivStatsSummary {
  totalProjekte: number;
  totalMaterial: number;
  totalSU: number;
  totalVolumen: number;
}

const CARDS = [
  { label: "Projekte", key: "totalProjekte" as const, color: "#7c3aed", isCurrency: false },
  { label: "Material", key: "totalMaterial" as const, color: "#2563eb", isCurrency: false },
  { label: "Subunternehmer", key: "totalSU" as const, color: "#d97706", isCurrency: false },
  { label: "Gesamtvolumen", key: "totalVolumen" as const, color: "var(--mr-red)", isCurrency: true },
];

export function ArchivStatsCards({ summary }: { summary: ArchivStatsSummary }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {CARDS.map((card) => {
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
            <p className="font-mono-amount text-3xl font-bold text-foreground mt-2 relative">
              {card.isCurrency ? formatBetrag(value) : value}
            </p>
          </div>
        );
      })}
    </div>
  );
}
