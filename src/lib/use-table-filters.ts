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

export interface TableFiltersConfig {
  suche: string;
  statusFilter: string;
  artFilter: ArtFilter;
  projektFilter: string;
}

export interface UseTableFiltersOptions extends Partial<TableFiltersConfig> {
  /** Default für Status-Filter — z.B. "offen" für Bestellungen, "" für Archiv. */
  defaultStatusFilter?: string;
}

export interface TableFilters extends TableFiltersConfig {
  setSuche: (next: string) => void;
  setStatusFilter: (next: string) => void;
  setArtFilter: (next: ArtFilter) => void;
  setProjektFilter: (next: string) => void;
  /** True wenn mindestens ein Filter aktiv (für "Filter zurücksetzen"-Button) */
  hasFilters: boolean;
  /** Setzt alle 4 Filter auf leer/Default */
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

  const hasFilters = useMemo(
    () => Boolean(suche || statusFilter || artFilter || projektFilter),
    [suche, statusFilter, artFilter, projektFilter],
  );

  const reset = useCallback(() => {
    setSuche("");
    setStatusFilter("");
    setArtFilter("");
    setProjektFilter("");
  }, []);

  const getConfig = useCallback(
    (): TableFiltersConfig => ({ suche, statusFilter, artFilter, projektFilter }),
    [suche, statusFilter, artFilter, projektFilter],
  );

  const applyConfig = useCallback((cfg: TableFiltersConfig) => {
    setSuche(cfg.suche);
    setStatusFilter(cfg.statusFilter);
    setArtFilter(cfg.artFilter);
    setProjektFilter(cfg.projektFilter);
  }, []);

  return {
    suche,
    statusFilter,
    artFilter,
    projektFilter,
    setSuche,
    setStatusFilter,
    setArtFilter,
    setProjektFilter,
    hasFilters,
    reset,
    getConfig,
    applyConfig,
  };
}
