/**
 * ArtTabs — Tab-Switcher zwischen Bestellungsarten (Material/Subunternehmer/Abo).
 *
 * Inactive Tabs zeigen kleine Count-Badges. "Alle"-Tab hat keinen Count
 * (würde nur die Summe sein, redundant).
 *
 * Aus bestellungen-tabelle.tsx extrahiert (Block-4-Foundation, 2026-05-05).
 * Wird perspektivisch auch im archiv-client genutzt sobald die Decomposition
 * dort weiter ist.
 */

export type ArtFilter = "" | "material" | "subunternehmer" | "abo";

export interface ArtTabsProps {
  value: ArtFilter;
  onChange: (next: ArtFilter) => void;
  /** Counts pro Bestellungsart für die Badge-Anzeige neben dem Tab-Label */
  counts: Record<"material" | "subunternehmer" | "abo", number>;
  /** Optional eigene Tab-Liste — Default: Alle/Material/SU/Abo */
  tabs?: { key: ArtFilter; label: string }[];
}

const DEFAULT_TABS: { key: ArtFilter; label: string }[] = [
  { key: "", label: "Alle" },
  { key: "material", label: "Material" },
  { key: "subunternehmer", label: "Subunternehmer" },
  { key: "abo", label: "Abo" },
];

export function ArtTabs({ value, onChange, counts, tabs = DEFAULT_TABS }: ArtTabsProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-canvas rounded-lg shrink-0">
      {tabs.map((tab) => {
        const isActive = value === tab.key;
        const count = tab.key ? counts[tab.key as keyof typeof counts] : 0;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            aria-pressed={isActive}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
              isActive
                ? "bg-white text-foreground shadow-sm"
                : "text-foreground-muted hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.key && count > 0 && (
              <span
                className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                  isActive ? "bg-brand text-white" : "bg-line text-foreground-muted"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
