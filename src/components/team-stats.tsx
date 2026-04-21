"use client";

/**
 * TeamStats — Bestellungen-pro-Besteller.
 *
 * Team-Transparenz für Firmeninhaber. Bewusst nicht mehr auf dem Dashboard —
 * dort dominiert der Workflow. Stattdessen in Einstellungen einsehbar als ruhige
 * Info-Section, ohne Action-Druck.
 *
 * Daten kommen vom Server (Service-Role für firmenweite Counts + benutzer_rollen
 * für Name-Mapping). Component ist reiner View, keine State-Logik.
 */
export interface TeamStatsProps {
  /** Counts pro Kürzel (z.B. {"MT": 42, "CR": 18}) */
  counts: Record<string, number>;
  /** Mapping Kürzel → Name für Anzeige */
  nameMap: Record<string, string>;
}

export function TeamStats({ counts, nameMap }: TeamStatsProps) {
  // UNBEKANNT rausfiltern (wird in Dashboard-Widget "Nicht zugeordnet" behandelt)
  const entries = Object.entries(counts).filter(([k]) => k !== "UNBEKANNT");
  if (entries.length === 0) return null;

  const maxCount = Math.max(...entries.map(([, c]) => c));
  const sorted = entries.sort((a, b) => b[1] - a[1]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
      {sorted.map(([kuerzel, count]) => {
        const name = nameMap[kuerzel];
        const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0;
        return (
          <div
            key={kuerzel}
            className="p-4 rounded-lg bg-input border border-line-subtle relative overflow-hidden"
          >
            <div
              className="absolute bottom-0 left-0 h-1 bg-brand/10 rounded-full"
              style={{ width: `${barWidth}%` }}
              aria-hidden="true"
            />
            <div className="flex items-center gap-3 relative">
              <div className="w-10 h-10 rounded-lg bg-brand text-white flex items-center justify-center text-xs font-bold shrink-0">
                {kuerzel}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {name || kuerzel}
                </p>
                <div className="flex items-baseline gap-1">
                  <p className="font-mono-amount text-xl font-bold text-foreground">
                    {count}
                  </p>
                  <p className="text-[10px] text-foreground-subtle uppercase tracking-wide">
                    Bestellungen
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
