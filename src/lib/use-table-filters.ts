/**
 * useTableFilters — gemeinsame Filter-State-Maschine für die großen Listen-Tabellen.
 *
 * Bündelt die 4 Filter-States (Suche, Status, Art, Projekt) plus derived
 * `hasFilters` und Methoden für saved-views (`getConfig()`/`applyConfig()`).
 *
 * Vorher in bestellungen-tabelle.tsx als 4 useState + verstreute Setter inline.
 * Mit dem Hook ist die Logik:
 *   - DRY-fähig — archiv/buchhaltung können denselben Filter-Block nutzen
 *   - Testbar als isolierte Einheit (siehe __tests__/use-table-filters.test.ts)
 *   - Saved-Views-Integration über `applyConfig` einheitlich
 */

import { useCallback, useMemo, useState } from "react";
import type { ArtFilter } from "@/components/ui/art-tabs";

/**
 * 06.05.2026 (Welle 4 Frontend) — Fälligkeits-Filter ergänzt damit Saved-Views
 * "Überfällig" / "Diese Woche fällig" möglich werden. Default = "alle"
 * (kein Filter). Werte werden client-side gegen `bestellung.faelligkeitsdatum`
 * + `bezahlt_am` ausgewertet.
 */
export type FaelligkeitsFilter =
  | "alle"
  | "ueberfaellig"           // faelligkeitsdatum < heute UND bezahlt_am IS NULL
  | "diese_woche"            // faelligkeitsdatum heute..+7d UND bezahlt_am IS NULL
  | "next_30d";              // faelligkeitsdatum heute..+30d UND bezahlt_am IS NULL

export interface TableFiltersConfig {
  suche: string;
  statusFilter: string;
  artFilter: ArtFilter;
  projektFilter: string;
  faelligkeitsFilter?: FaelligkeitsFilter;
}

export interface UseTableFiltersOptions extends Partial<TableFiltersConfig> {
  /** Default für Status-Filter — z.B. "offen" für Bestellungen, "" für Archiv. */
  defaultStatusFilter?: string;
}

export interface TableFilters extends TableFiltersConfig {
  faelligkeitsFilter: FaelligkeitsFilter;
  setSuche: (next: string) => void;
  setStatusFilter: (next: string) => void;
  setArtFilter: (next: ArtFilter) => void;
  setProjektFilter: (next: string) => void;
  setFaelligkeitsFilter: (next: FaelligkeitsFilter) => void;
  /** True wenn mindestens ein Filter aktiv (für "Filter zurücksetzen"-Button) */
  hasFilters: boolean;
  /** Setzt alle Filter auf leer/Default */
  reset: () => void;
  /** Liefert den aktuellen Filter-Snapshot — für saved-views-Persistierung */
  getConfig: () => TableFiltersConfig;
  /** Übernimmt einen Filter-Snapshot — z.B. beim Laden eines saved-view */
  applyConfig: (cfg: TableFiltersConfig) => void;
}

export function useTableFilters(options: UseTableFiltersOptions = {}): TableFilters {
  const initialStatus = options.statusFilter ?? options.defaultStatusFilter ?? "";

  const [suche, setSuche] = useState(options.suche ?? "");
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [artFilter, setArtFilter] = useState<ArtFilter>(options.artFilter ?? "");
  const [projektFilter, setProjektFilter] = useState(options.projektFilter ?? "");
  const [faelligkeitsFilter, setFaelligkeitsFilter] = useState<FaelligkeitsFilter>(
    options.faelligkeitsFilter ?? "alle",
  );

  const hasFilters = useMemo(
    () => Boolean(
      suche || statusFilter || artFilter || projektFilter
      || (faelligkeitsFilter && faelligkeitsFilter !== "alle"),
    ),
    [suche, statusFilter, artFilter, projektFilter, faelligkeitsFilter],
  );

  const reset = useCallback(() => {
    setSuche("");
    setStatusFilter("");
    setArtFilter("");
    setProjektFilter("");
    setFaelligkeitsFilter("alle");
  }, []);

  const getConfig = useCallback(
    (): TableFiltersConfig => ({
      suche, statusFilter, artFilter, projektFilter, faelligkeitsFilter,
    }),
    [suche, statusFilter, artFilter, projektFilter, faelligkeitsFilter],
  );

  const applyConfig = useCallback((cfg: TableFiltersConfig) => {
    setSuche(cfg.suche);
    setStatusFilter(cfg.statusFilter);
    setArtFilter(cfg.artFilter);
    setProjektFilter(cfg.projektFilter);
    setFaelligkeitsFilter(cfg.faelligkeitsFilter ?? "alle");
  }, []);

  return {
    suche,
    statusFilter,
    artFilter,
    projektFilter,
    faelligkeitsFilter,
    setSuche,
    setStatusFilter,
    setArtFilter,
    setProjektFilter,
    setFaelligkeitsFilter,
    hasFilters,
    reset,
    getConfig,
    applyConfig,
  };
}

/**
 * 06.05.2026 — Predicate-Helper für FaelligkeitsFilter. Wird in der
 * Tabellen-Komponente angewendet (client-side, weil bestellungen schon
 * voll geladen sind). Bei Performance-Bedarf könnte ein Server-Side-Filter
 * via .gte/.lte auf faelligkeitsdatum ergänzt werden.
 */
export function matchesFaelligkeitsFilter(
  bestellung: { faelligkeitsdatum?: string | null; bezahlt_am?: string | null },
  filter: FaelligkeitsFilter,
): boolean {
  if (filter === "alle") return true;
  if (bestellung.bezahlt_am) return false;
  const f = bestellung.faelligkeitsdatum;
  if (!f) return false;
  const datum = new Date(f).getTime();
  const heuteMs = new Date(new Date().toDateString()).getTime();
  const tag = 24 * 60 * 60 * 1000;
  if (filter === "ueberfaellig") return datum < heuteMs;
  if (filter === "diese_woche") return datum >= heuteMs && datum < heuteMs + 7 * tag;
  if (filter === "next_30d") return datum >= heuteMs && datum < heuteMs + 30 * tag;
  return true;
}
