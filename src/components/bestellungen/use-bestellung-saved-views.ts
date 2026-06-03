"use client";

/**
 * useBestellungSavedViews — Saved-Views-State + System-Defaults für die
 * Bestellungen-Tabelle. Aus bestellungen-tabelle.tsx extrahiert
 * (12.05.2026, F3.3 Sprint 3).
 *
 * Konsolidiert:
 *   - System-Defaults ("Überfällig", "Diese Woche fällig") — idempotent geseedet
 *   - useSavedViews-Hook mit ViewConfig-Generic
 *   - activeViewId + Default-View-Auto-Apply (didApplyDefault-Ref)
 *   - applyView (filters + density + sort gleichzeitig setzen)
 *   - currentConfig + currentConfigIsDirty via deepEqual
 */

import { useState, useEffect, useRef } from "react";
import { useSavedViews, type SortState, type Density } from "@/components/ui";
import { deepEqual } from "@/lib/deep-equal";
import type { ArtFilter } from "@/components/ui/art-tabs";
import type { FaelligkeitsFilter } from "@/lib/use-table-filters";

export interface ViewConfig {
  suche: string;
  statusFilter: string;
  artFilter: ArtFilter;
  projektFilter: string;
  faelligkeitsFilter?: FaelligkeitsFilter;
  density: Density;
  sort: SortState;
}

const SYSTEM_DEFAULTS: Array<{ id: string; name: string; config: ViewConfig }> = [
  {
    id: "system-ueberfaellig",
    name: "Überfällig",
    config: {
      suche: "",
      statusFilter: "",
      artFilter: "",
      projektFilter: "",
      faelligkeitsFilter: "ueberfaellig",
      density: "comfortable",
      sort: { key: "created_at", direction: "asc" }, // älteste zuerst
    },
  },
  {
    id: "system-diese-woche-faellig",
    name: "Diese Woche fällig",
    config: {
      suche: "",
      statusFilter: "",
      artFilter: "",
      projektFilter: "",
      faelligkeitsFilter: "diese_woche",
      density: "comfortable",
      sort: { key: "created_at", direction: "asc" },
    },
  },
];

export interface UseBestellungSavedViewsParams {
  // Aktuelle Filter-Werte (für currentConfig + dirty-Check)
  suche: string;
  statusFilter: string;
  artFilter: ArtFilter;
  projektFilter: string;
  faelligkeitsFilter: FaelligkeitsFilter;
  density: Density;
  sort: SortState;
  // Setter (für applyView)
  applyFilterConfig: (cfg: {
    suche: string;
    statusFilter: string;
    artFilter: ArtFilter;
    projektFilter: string;
    faelligkeitsFilter?: FaelligkeitsFilter;
  }) => void;
  setDensity: (d: Density) => void;
  setSort: (s: SortState) => void;
  /**
   * 03.06.2026 (Phase 1 Quick Wins): SavedViews-Storage-Key ist jetzt pro
   * Pool-Scope getrennt. Vorher: ein einziger `saved-views.bestellungen`
   * Key — der "Überfällig"-Default schlug auf alle 4 Tabs durch und liess
   * das Pool-Tab leer wirken (Pool-Items haben kein faelligkeitsdatum).
   * Pool-Scope skippt zusätzlich das Auto-Apply komplett: dort soll der
   * User die ungefilterte Liste sehen.
   */
  scope?: "pool" | "mine-open" | "mine-done" | "all";
}

export function useBestellungSavedViews({
  suche,
  statusFilter,
  artFilter,
  projektFilter,
  faelligkeitsFilter,
  density,
  sort,
  applyFilterConfig,
  setDensity,
  setSort,
  scope,
}: UseBestellungSavedViewsParams) {
  const tableKey = scope ? `bestellungen.${scope}` : "bestellungen";
  const savedViews = useSavedViews<ViewConfig>(tableKey, {
    systemDefaults: SYSTEM_DEFAULTS,
  });
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  // Auto-apply default view on first mount (once)
  const didApplyDefault = useRef(false);
  useEffect(() => {
    if (didApplyDefault.current) return;
    // Pool-Scope: keine Default-View-Auto-Anwendung. Pool soll alle
    // Pool-Items zeigen, nicht durch einen "Überfällig"-Filter ausgedünnt
    // werden (Pool-Items haben i.d.R. noch kein Fälligkeitsdatum).
    if (scope === "pool") {
      didApplyDefault.current = true;
      return;
    }
    if (savedViews.defaultView) {
      const d = savedViews.defaultView;
      applyFilterConfig({
        suche: d.config.suche,
        statusFilter: d.config.statusFilter,
        artFilter: d.config.artFilter,
        projektFilter: d.config.projektFilter,
        faelligkeitsFilter: d.config.faelligkeitsFilter,
      });
      setDensity(d.config.density);
      setSort(d.config.sort);
      setActiveViewId(d.id);
    }
    didApplyDefault.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only on first mount
  }, [savedViews.defaultView]);

  const currentConfig: ViewConfig = {
    suche,
    statusFilter,
    artFilter,
    projektFilter,
    faelligkeitsFilter,
    density,
    sort,
  };

  function applyView(view: { id: string; config: ViewConfig }) {
    applyFilterConfig({
      suche: view.config.suche,
      statusFilter: view.config.statusFilter,
      artFilter: view.config.artFilter,
      projektFilter: view.config.projektFilter,
      faelligkeitsFilter: view.config.faelligkeitsFilter,
    });
    setDensity(view.config.density);
    setSort(view.config.sort);
    setActiveViewId(view.id);
  }

  const activeViewConfig =
    activeViewId && savedViews.views.find((v) => v.id === activeViewId)?.config;
  const currentConfigIsDirty = activeViewConfig
    ? !deepEqual(activeViewConfig, currentConfig)
    : false;

  return {
    savedViews,
    activeViewId,
    setActiveViewId,
    applyView,
    currentConfig,
    currentConfigIsDirty,
  };
}
