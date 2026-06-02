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
  // 02.06.2026 (UI-Polish): Secondary-Tab-Style. Bewusst kleiner + leiser als
  // ScopeTabs (Primary), damit die Hierarchie (Scope > Art) visuell klar ist.
  // Ergebnis: pill-Container schmaler (h-9), Text-Größe runter auf 13px,
  // Counter-Pill nur noch als Suffix mit Brand-Tint statt Solid-Background.
  return (
    <div
      className="inline-flex items-center gap-0.5 p-0.5 bg-canvas rounded-md shrink-0 h-9"
      role="tablist"
      aria-label="Bestellungsart"
    >
      {tabs.map((tab) => {
        const isActive = value === tab.key;
        const count = tab.key ? counts[tab.key as keyof typeof counts] : 0;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            onClick={() => onChange(tab.key)}
            aria-pressed={isActive}
            aria-selected={isActive}
            className={`inline-flex items-center gap-1.5 h-8 px-3 text-[13px] font-medium rounded-[6px] transition-[background-color,color,box-shadow] duration-150 ease-out whitespace-nowrap focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] ${
              isActive
                ? "bg-surface text-foreground shadow-sm"
                : "text-foreground-muted hover:text-foreground"
            }`}
          >
            <span>{tab.label}</span>
            {tab.key && count > 0 && (
              <span
                className={`font-mono-amount text-[10px] font-semibold tabular-nums ${
                  isActive ? "text-brand" : "text-foreground-faint"
                }`}
                aria-label={`${count} Bestellungen`}
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
