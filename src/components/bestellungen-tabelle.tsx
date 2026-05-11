"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDatum } from "@/lib/formatters";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DokumentIcon } from "@/components/ui/cells/dokument-icon";
import { StatusCell } from "@/components/ui/cells/status-cell";
import { BetragCell } from "@/components/ui/cells/betrag-cell";
import { ArtTabs, type ArtFilter } from "@/components/ui/art-tabs";
import { useTableFilters, matchesFaelligkeitsFilter, type FaelligkeitsFilter } from "@/lib/use-table-filters";
import { useBestellungenListRealtime } from "@/lib/hooks/use-bestellung-realtime";
import { FilterBar } from "@/components/ui/filter-bar";
import { STATUS_FILTER_OPTIONS } from "@/lib/status-config";
import {
  DataTable,
  DensityToggle,
  useTableDensity,
  BulkToolbar,
  Button,
  Badge,
  SavedViewsMenu,
  useSavedViews,
  EmptyState,
  useToast,
  type DataTableColumn,
  type SortState,
  type Density,
} from "@/components/ui";
import {
  IconSearch,
  IconX,
  IconCheck,
  IconTrash,
  IconAlertCircle,
} from "@/components/ui/icons";
import { exportToCsv, csvFilename } from "@/lib/export-csv";
import { deepEqual } from "@/lib/deep-equal";
import { displayBestellnummer, type Bestellungsart } from "@/lib/bestellung-utils";

interface Bestellung {
  id: string;
  bestellnummer: string | null;
  auftragsnummer?: string | null;
  lieferscheinnummer?: string | null;
  haendler_name: string | null;
  besteller_kuerzel: string;
  besteller_name: string;
  betrag: number | null;
  betrag_ist_netto?: boolean;
  waehrung: string;
  status: string;
  hat_bestellbestaetigung: boolean;
  hat_lieferschein: boolean;
  hat_rechnung: boolean;
  bestellungsart?: Bestellungsart;
  subunternehmer_name?: string | null;
  hat_versandbestaetigung?: boolean;
  projekt_id: string | null;
  projekt_name: string | null;
  mahnung_am: string | null;
  mahnung_count?: number;
  created_at: string;
  // 06.05.2026 — extrahierte Felder aus Mail/PDF
  bestelldatum?: string | null;
  faelligkeitsdatum?: string | null;
  kundennummer?: string | null;
  projekt_referenz?: string | null;
  // 07.05.2026 — Doku-Nummern für Such-Index (Rechnungs-/Lieferschein-/Auftragsnummern aus dokumente-Tabelle)
  doku_nummern?: string[];
}

interface ProjektOption {
  id: string;
  name: string;
  farbe: string;
}


// STATUS_FILTER_OPTIONS wird jetzt aus @/lib/status-config importiert.

// DokumentIcon wurde nach @/components/ui/cells/dokument-icon extrahiert.

export function BestellungenTabelle({
  bestellungen,
  projekte = [],
  aktiverProjektFilter,
  aktiverProjektName,
}: {
  bestellungen: Bestellung[];
  projekte?: ProjektOption[];
  aktiverProjektFilter?: string | null;
  aktiverProjektName?: string | null;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // 07.05.2026 — Client-side Pagination.
  // Bestellungen kommen vom Server vollständig (oder bis HARD_CAP).
  // Filter+Sort+Pagination laufen alle hier — damit funktionieren Filter
  // korrekt über die Gesamt-Menge und Sort-Reihenfolge ist global.
  // 07.05.2026 (v2) — Page-State in URL ?page=N persistiert. Beim Browser-Back
  // von der Bestelldetail-Seite landet der User damit automatisch auf seiner
  // letzten Page (statt Page 1). Filter/Sort liegen weiterhin im React-State —
  // beim Wechsel wird der page-Param aus der URL entfernt (Reset auf Page 1).
  const PAGE_SIZE = 20;
  const totalCount = bestellungen.length;
  const pageParam = searchParams.get("page");
  const currentPage = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;
  const setPageInUrl = useCallback(
    (page: number) => {
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      if (page <= 1) params.delete("page");
      else params.set("page", String(page));
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    },
    [router, searchParams],
  );

  // Filters
  const filters = useTableFilters({
    defaultStatusFilter: "offen",
    projektFilter: aktiverProjektFilter || "",
  });
  const {
    suche, setSuche,
    statusFilter, setStatusFilter,
    artFilter, setArtFilter,
    projektFilter, setProjektFilter,
    faelligkeitsFilter, setFaelligkeitsFilter,
    hasFilters,
  } = filters;
  useEffect(() => {
    setProjektFilter(aktiverProjektFilter || "");
  }, [aktiverProjektFilter]);

  // 06.05.2026 (Welle 4 Frontend-Adoption) — Realtime-Subscribe.
  // Auto-Refresh bei jedem INSERT/UPDATE/DELETE auf bestellungen mit 1.5s
  // Debounce gegen Burst-Updates (Re-Backfill-Cron). Server-Component lädt
  // dann die neue Page neu — inkl. der gerade angekommenen Mail.
  useBestellungenListRealtime();

  // Table state
  const [density, setDensity] = useTableDensity("bestellungen.density");
  const [sort, setSort] = useState<SortState>({ key: "created_at", direction: "desc" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Mehrfachauswahl-Modus: Checkbox-Spalte ist standardmäßig aus, der User
  // schaltet sie nur ein wenn er Bulk-Aktionen (z.B. Löschen) braucht.
  const [selectMode, setSelectMode] = useState(false);

  // Saved Views — shape of what's persisted per view
  type ViewConfig = {
    suche: string;
    statusFilter: string;
    artFilter: ArtFilter;
    projektFilter: string;
    faelligkeitsFilter?: FaelligkeitsFilter;
    density: Density;
    sort: SortState;
  };
  // 06.05.2026 (Welle 4 Frontend) — System-Defaults für sinnvolle Pre-Set-Views.
  // Idempotent geseedet: einmal gelöscht bleiben sie weg.
  const systemDefaults: Array<{ id: string; name: string; config: ViewConfig }> = [
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
        sort: { key: "created_at", direction: "asc" },  // älteste zuerst
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
  const savedViews = useSavedViews<ViewConfig>("bestellungen", { systemDefaults });
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  // Auto-apply default view on first mount (once)
  const didApplyDefault = useRef(false);
  useEffect(() => {
    if (didApplyDefault.current) return;
    if (savedViews.defaultView) {
      const d = savedViews.defaultView;
      filters.applyConfig({
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
    // Intentionally only runs once (on first render after views load)
  }, [savedViews.defaultView, setDensity]);

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
    filters.applyConfig({
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

  // Async UI state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showFreigebenDialog, setShowFreigebenDialog] = useState(false);
  const [bulkFreigebenLoading, setBulkFreigebenLoading] = useState(false);
  const [freigabeLoadingId, setFreigabeLoadingId] = useState<string | null>(null);
  const [freigabeConfirmId, setFreigabeConfirmId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Search input focus (/ shortcut)
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Clear selection when filters change
  useEffect(() => {
    setSelected(new Set());
  }, [suche, statusFilter, artFilter, projektFilter]);

  const gefiltert = useMemo(
    () =>
      bestellungen.filter((b) => {
        const sucheLc = suche.toLowerCase();
        const suchMatch =
          !suche ||
          b.bestellnummer?.toLowerCase().includes(sucheLc) ||
          b.haendler_name?.toLowerCase().includes(sucheLc) ||
          b.besteller_name?.toLowerCase().includes(sucheLc) ||
          // 07.05.2026 — auch Rechnungs-/Lieferschein-/Auftragsnummern aus
          // dokumente durchsuchen (z.B. Raab-Karcher-Sammelbestellung mit
          // mehreren Rechnungs-PDFs an einer Auftragsnr.)
          (b.doku_nummern || []).some((n) => n.toLowerCase().includes(sucheLc));

        const statusMatch =
          !statusFilter ||
          (statusFilter === "offen" ? b.status !== "freigegeben" : b.status === statusFilter);
        const artMatch = !artFilter || (b.bestellungsart || "material") === artFilter;
        const projektMatch = !projektFilter || b.projekt_id === projektFilter;
        const faelligkeitsMatch = matchesFaelligkeitsFilter(b, faelligkeitsFilter);

        return suchMatch && statusMatch && artMatch && projektMatch && faelligkeitsMatch;
      }),
    [bestellungen, suche, statusFilter, artFilter, projektFilter, faelligkeitsFilter],
  );

  // Client-side sort
  const sorted = useMemo(() => {
    if (!sort) return gefiltert;
    const arr = [...gefiltert];
    const dir = sort.direction === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let av: string | number | null | undefined;
      let bv: string | number | null | undefined;
      switch (sort.key) {
        case "bestellnummer":
          av = displayBestellnummer(a);
          bv = displayBestellnummer(b);
          break;
        case "haendler_name":
          av = (a.haendler_name || "").toLowerCase();
          bv = (b.haendler_name || "").toLowerCase();
          break;
        case "created_at":
          // bestelldatum bevorzugt für Sortierung (echtes Datum, nicht Erfassung)
          av = a.bestelldatum ?? a.created_at;
          bv = b.bestelldatum ?? b.created_at;
          break;
        case "betrag":
          av = a.betrag ?? 0;
          bv = b.betrag ?? 0;
          break;
        case "status":
          av = a.status;
          bv = b.status;
          break;
        default:
          return 0;
      }
      if (av! < bv!) return -1 * dir;
      if (av! > bv!) return 1 * dir;
      return 0;
    });
    return arr;
  }, [gefiltert, sort]);

  // 07.05.2026 — Client-side Pagination.
  // totalPages aus gefilterten Resultaten (nicht totalCount), damit User die
  // ECHTE Anzahl Pages für seine Filter sieht. Page 1 wenn Filter wechselt.
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedRows = useMemo(() => {
    const from = (safeCurrentPage - 1) * PAGE_SIZE;
    return sorted.slice(from, from + PAGE_SIZE);
  }, [sorted, safeCurrentPage]);

  // Filter/Sort-Wechsel → Page 1 (Page-Param aus URL entfernen).
  // Realtime-Refresh hält Page erhalten (Bestellungen-Array ändert sich,
  // aber Filter nicht → kein Reset).
  useEffect(() => {
    if (pageParam && pageParam !== "1") setPageInUrl(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suche, statusFilter, artFilter, projektFilter, faelligkeitsFilter, sort]);

  const artCounts = useMemo(() => {
    const counts = { material: 0, subunternehmer: 0, abo: 0 };
    for (const b of bestellungen) {
      const art = b.bestellungsart || "material";
      if (art in counts) counts[art as keyof typeof counts]++;
    }
    return counts;
  }, [bestellungen]);

  const projektFarbenMap = useMemo(
    () => new Map(projekte.map((p) => [p.id, p.farbe])),
    [projekte],
  );

  function goToPage(page: number) {
    setPageInUrl(Math.max(1, Math.min(page, totalPages)));
  }

  async function handleQuickFreigabe(bestellungId: string) {
    setFreigabeConfirmId(null);
    setFreigabeLoadingId(bestellungId);
    try {
      const res = await fetch(`/api/bestellungen/${bestellungId}/freigeben`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        router.refresh();
        toast.success("Bestellung freigegeben");
        return;
      }
      const data = await res.json().catch(() => null);
      toast.error("Freigabe fehlgeschlagen", {
        description: data?.error ?? "Bitte erneut versuchen.",
      });
    } catch {
      toast.error("Netzwerkfehler", {
        description: "Freigabe konnte nicht gesendet werden.",
      });
    } finally {
      setFreigabeLoadingId(null);
    }
  }

  // 07.05.2026 — PDF-Vorschau via Same-Origin-Proxy statt Signed-URL.
  // Signed-URL → iframe → Browser-Block (X-Frame-Options vom Supabase-Storage).
  // Proxy ist langsamer (Vercel-Lambda zwischenschieben), kompensiert durch
  // (1) Hover-Preload, der den Browser-HTTP-Cache vorwärmt — beim Click ist
  //     der Stream schon im Cache, iframe rendert instant.
  // (2) `Cache-Control: private, max-age=300` im Proxy → Browser cached 5 Min.
  // (3) Mehrere Hovers gleicher PDF → preloadedSet verhindert doppelte Fetches.
  const preloadedSet = useRef<Set<string>>(new Set());

  const buildPreviewUrl = useCallback(
    (bestellungId: string, typ: string) =>
      `/api/pdfs/${bestellungId}?typ=${encodeURIComponent(typ)}`,
    [],
  );

  function preloadPreview(bestellungId: string, typ: string) {
    const key = `${bestellungId}:${typ}`;
    if (preloadedSet.current.has(key)) return;
    preloadedSet.current.add(key);
    // Fetch füllt Browser-HTTP-Cache. Beim späteren iframe-Document-Request
    // greift derselbe Cache (gleiche URL + Cache-Control). Kein await nötig —
    // der Browser handhabt das im Hintergrund.
    void fetch(buildPreviewUrl(bestellungId, typ), { credentials: "same-origin" })
      .catch(() => preloadedSet.current.delete(key));
  }

  function handlePreview(bestellungId: string, typ: string) {
    setPreviewId(bestellungId);
    setPreviewUrl(buildPreviewUrl(bestellungId, typ));
  }

  function closePreview() {
    setPreviewId(null);
    setPreviewUrl(null);
  }

  function handleCsvExport(rowsToExport: Bestellung[]) {
    const rows = rowsToExport.length > 0 ? rowsToExport : [];
    exportToCsv(csvFilename("bestellungen"), rows, [
      { header: "Bestellnr.", value: (b) => b.bestellnummer ?? "" },
      { header: "Händler", value: (b) => b.haendler_name ?? "" },
      { header: "Besteller", value: (b) => b.besteller_name },
      { header: "Bestellungsart", value: (b) => b.bestellungsart ?? "material" },
      { header: "Projekt", value: (b) => b.projekt_name ?? "" },
      { header: "Status", value: (b) => b.status },
      { header: "Betrag", value: (b) => b.betrag ?? 0, numeric: true },
      { header: "Währung", value: (b) => b.waehrung },
      { header: "Netto?", value: (b) => (b.betrag_ist_netto ? "Ja" : "Nein") },
      { header: "Bestellbestätigung", value: (b) => (b.hat_bestellbestaetigung ? "Ja" : "Nein") },
      { header: "Lieferschein", value: (b) => (b.hat_lieferschein ? "Ja" : "Nein") },
      { header: "Rechnung", value: (b) => (b.hat_rechnung ? "Ja" : "Nein") },
      { header: "Versand", value: (b) => (b.hat_versandbestaetigung ? "Ja" : "Nein") },
      { header: "Mahnung", value: (b) => (b.mahnung_am ? `${b.mahnung_count ?? 1}× seit ${b.mahnung_am.slice(0, 10)}` : "") },
      { header: "Erstellt", value: (b) => b.created_at.slice(0, 10) },
    ]);
  }

  async function handleBulkDelete() {
    setDeleteLoading(true);
    try {
      const res = await fetch("/api/bestellungen/verwerfen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bestellung_ids: Array.from(selected) }),
      });
      if (res.ok) {
        const count = selected.size;
        setSelected(new Set());
        setShowDeleteDialog(false);
        router.refresh();
        toast.success(`${count} ${count === 1 ? "Bestellung entfernt" : "Bestellungen entfernt"}`);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error("Löschen fehlgeschlagen", {
          description: data.error || "Bitte erneut versuchen.",
        });
      }
    } catch {
      toast.error("Netzwerkfehler", {
        description: "Bestellungen konnten nicht gelöscht werden.",
      });
    } finally {
      setDeleteLoading(false);
    }
  }

  // 11.05.2026 — Bulk-Freigabe: nutzt /api/bestellungen/bulk-freigeben.
  // Server skippt bereits-freigegebene/no-rechnung/no-permission und liefert
  // Summary zurück. Wir zeigen einen aussagekräftigen Toast statt stillem Erfolg.
  async function handleBulkFreigeben() {
    setBulkFreigebenLoading(true);
    try {
      const res = await fetch("/api/bestellungen/bulk-freigeben", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Bulk-Freigabe fehlgeschlagen", {
          description: data.error || "Bitte erneut versuchen.",
        });
        return;
      }
      const freigegebenN = (data.freigegeben ?? []).length;
      const alreadyN = (data.already_freigegeben ?? []).length;
      const noRechnungN = (data.no_rechnung ?? []).length;
      const noPermissionN = (data.no_permission ?? []).length;
      const errorsN = (data.errors ?? []).length;
      const parts: string[] = [];
      if (freigegebenN > 0) parts.push(`${freigegebenN} freigegeben`);
      if (alreadyN > 0) parts.push(`${alreadyN} bereits freigegeben`);
      if (noRechnungN > 0) parts.push(`${noRechnungN} ohne Rechnung`);
      if (noPermissionN > 0) parts.push(`${noPermissionN} ohne Berechtigung`);
      if (errorsN > 0) parts.push(`${errorsN} Fehler`);

      setShowFreigebenDialog(false);
      setSelected(new Set());
      router.refresh();

      if (errorsN > 0 || noRechnungN > 0 || noPermissionN > 0) {
        toast.warning("Bulk-Freigabe teilweise erfolgreich", {
          description: parts.join(" · "),
        });
      } else if (freigegebenN > 0) {
        toast.success(parts.join(" · "));
      } else {
        toast.info("Keine Bestellung freigegeben", { description: parts.join(" · ") });
      }
    } catch {
      toast.error("Netzwerkfehler", {
        description: "Bulk-Freigabe konnte nicht ausgeführt werden.",
      });
    } finally {
      setBulkFreigebenLoading(false);
    }
  }

  // ─── Column definitions ────────────────────────────────────────

  const columns: DataTableColumn<Bestellung>[] = useMemo(
    () => [
      {
        key: "bestellnummer",
        label: "Bestellnr.",
        sortable: true,
        stopPropagation: true,
        render: (b) => (
          <Link
            href={`/bestellungen/${b.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-mono-amount font-semibold text-brand hover:text-brand-light transition-colors"
          >
            {displayBestellnummer(b)}
            {b.mahnung_am && (
              <span
                className="ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-error-bg text-error text-[10px] font-semibold"
                title={`Mahnung eingegangen am ${new Date(b.mahnung_am).toLocaleDateString("de-DE")}`}
              >
                <IconAlertCircle className="w-3 h-3" />
                {b.mahnung_count && b.mahnung_count > 1
                  ? `${b.mahnung_count}. Mahnung`
                  : "Mahnung"}
              </span>
            )}
          </Link>
        ),
      },
      {
        key: "haendler_name",
        label: "Händler / Firma",
        sortable: true,
        render: (b) => {
          const artValue = b.bestellungsart || "material";
          const isSub = artValue === "subunternehmer";
          const isAbo = artValue === "abo";
          return (
            <>
              <div className="flex items-center gap-2">
                <span className="truncate max-w-[150px]">{b.haendler_name || "–"}</span>
                {isSub && (
                  <Badge tone="warning" size="sm">
                    SUB
                  </Badge>
                )}
                {isAbo && (
                  <Badge tone="info" size="sm">
                    ABO
                  </Badge>
                )}
              </div>
              {b.projekt_name && (
                <div className="lg:hidden mt-1 flex items-center gap-1.5 text-[11px] text-foreground-muted">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{
                      background:
                        projektFarbenMap.get(b.projekt_id!) || "var(--mr-red)",
                    }}
                  />
                  {b.projekt_name}
                </div>
              )}
            </>
          );
        },
      },
      {
        key: "projekt_name",
        label: "Projekt",
        hideBelow: "lg",
        render: (b) =>
          b.projekt_name ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-foreground max-w-[120px]">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  background:
                    projektFarbenMap.get(b.projekt_id!) || "var(--mr-red)",
                }}
              />
              <span className="truncate">{b.projekt_name}</span>
            </span>
          ) : (
            <span className="text-line-strong text-[12px]">–</span>
          ),
      },
      {
        key: "created_at",
        label: "Datum",
        sortable: true,
        hideBelow: "md",
        className: "text-foreground-subtle whitespace-nowrap",
        // 06.05.2026 — bestelldatum (echtes Bestelldatum aus BB-Doku) bevorzugt
        // vor created_at (Pipeline-Erfassungszeitpunkt). Tooltip zeigt beide.
        render: (b) => {
          const echtBestellt = b.bestelldatum;
          if (echtBestellt) {
            return (
              <span title={`Bestellt am ${formatDatum(echtBestellt)} · Erfasst ${formatDatum(b.created_at)}`}>
                {formatDatum(echtBestellt)}
              </span>
            );
          }
          return formatDatum(b.created_at);
        },
      },
      {
        key: "hat_bestellbestaetigung",
        label: "Best.",
        align: "center",
        hideBelow: "sm",
        stopPropagation: true,
        render: (b) => {
          const artValue = b.bestellungsart || "material";
          if (artValue === "subunternehmer" || artValue === "abo") {
            return <span className="text-line-strong">–</span>;
          }
          return (
            <div className="flex justify-center">
              <DokumentIcon
                vorhanden={b.hat_bestellbestaetigung}
                onClick={
                  b.hat_bestellbestaetigung
                    ? (e) => {
                        e.stopPropagation();
                        handlePreview(b.id, "bestellbestaetigung");
                      }
                    : undefined
                }
                onMouseEnter={
                  b.hat_bestellbestaetigung
                    ? () => preloadPreview(b.id, "bestellbestaetigung")
                    : undefined
                }
              />
            </div>
          );
        },
      },
      {
        key: "hat_lieferschein",
        label: "LS",
        align: "center",
        hideBelow: "sm",
        stopPropagation: true,
        render: (b) => {
          const artValue = b.bestellungsart || "material";
          if (artValue === "subunternehmer" || artValue === "abo") {
            return <span className="text-line-strong">–</span>;
          }
          return (
            <div className="flex justify-center">
              <DokumentIcon
                vorhanden={b.hat_lieferschein}
                onClick={
                  b.hat_lieferschein
                    ? (e) => {
                        e.stopPropagation();
                        handlePreview(b.id, "lieferschein");
                      }
                    : undefined
                }
                onMouseEnter={
                  b.hat_lieferschein
                    ? () => preloadPreview(b.id, "lieferschein")
                    : undefined
                }
              />
            </div>
          );
        },
      },
      {
        key: "hat_rechnung",
        label: "RE",
        align: "center",
        hideBelow: "sm",
        stopPropagation: true,
        render: (b) => (
          <div className="flex justify-center">
            <DokumentIcon
              vorhanden={b.hat_rechnung}
              onClick={
                b.hat_rechnung
                  ? (e) => {
                      e.stopPropagation();
                      handlePreview(b.id, "rechnung");
                    }
                  : undefined
              }
              onMouseEnter={
                b.hat_rechnung ? () => preloadPreview(b.id, "rechnung") : undefined
              }
            />
          </div>
        ),
      },
      {
        key: "hat_versandbestaetigung",
        label: "VS",
        align: "center",
        hideBelow: "sm",
        stopPropagation: true,
        render: (b) => {
          const artValue = b.bestellungsart || "material";
          if (artValue === "subunternehmer" || artValue === "abo") {
            return <span className="text-line-strong">–</span>;
          }
          return (
            <div className="flex justify-center">
              <DokumentIcon
                vorhanden={b.hat_versandbestaetigung ?? false}
                onClick={
                  b.hat_versandbestaetigung
                    ? (e) => {
                        e.stopPropagation();
                        handlePreview(b.id, "versandbestaetigung");
                      }
                    : undefined
                }
                onMouseEnter={
                  b.hat_versandbestaetigung
                    ? () => preloadPreview(b.id, "versandbestaetigung")
                    : undefined
                }
              />
            </div>
          );
        },
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (b) => <StatusCell status={b.status} />,
      },
      {
        key: "betrag",
        label: "Betrag",
        sortable: true,
        align: "right",
        className: "font-mono-amount font-semibold",
        render: (b) => <BetragCell betrag={b.betrag} waehrung={b.waehrung} istNetto={b.betrag_ist_netto} />,
      },
      {
        key: "actions",
        label: "",
        stopPropagation: true,
        width: 48,
        align: "right",
        render: (b) => {
          const kannFreigeben = b.status !== "freigegeben" && b.hat_rechnung;
          if (!kannFreigeben) {
            return <span className="text-line-strong text-[12px]">–</span>;
          }
          const isLoading = freigabeLoadingId === b.id;
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFreigabeConfirmId(b.id);
              }}
              disabled={isLoading}
              title="Rechnung freigeben"
              aria-label={`Rechnung freigeben für ${displayBestellnummer(b)}`}
              className="inline-flex items-center justify-center w-8 h-8 rounded-md text-foreground-muted hover:text-status-freigegeben hover:bg-success-bg transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <IconCheck className="w-4 h-4" />
            </button>
          );
        },
      },
    ],
    [projektFarbenMap, freigabeLoadingId],
  );

  return (
    <>
      {/* Projekt-Filter Banner */}
      {aktiverProjektName && aktiverProjektFilter && (
        <div className="mt-4 flex items-center gap-2 px-4 py-2.5 bg-input border border-line rounded-lg text-sm">
          <svg
            className="w-4 h-4 text-foreground-subtle shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          <span className="text-foreground-subtle">Gefiltert nach Projekt:</span>
          <span className="font-semibold text-foreground">{aktiverProjektName}</span>
          <button
            onClick={() => router.push("/bestellungen")}
            className="ml-auto p-1 text-foreground-subtle hover:text-brand transition-colors"
            title="Filter entfernen"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Art-Tabs + Search + Filters */}
      <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <ArtTabs value={artFilter} onChange={setArtFilter} counts={artCounts} />

        <FilterBar
          suche={suche}
          onSucheChange={setSuche}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          projektFilter={projektFilter}
          onProjektFilterChange={setProjektFilter}
          hasFilters={hasFilters}
          onReset={filters.reset}
          statusOptions={STATUS_FILTER_OPTIONS}
          projekte={projekte.map((p) => ({ id: p.id, name: p.name }))}
          searchInputRef={searchInputRef}
        >
          <DensityToggle density={density} onChange={setDensity} />
          <button
            type="button"
            onClick={() => {
              setSelectMode((prev) => {
                if (prev) setSelected(new Set());
                return !prev;
              });
            }}
            aria-pressed={selectMode}
            title={selectMode ? "Auswahl-Modus beenden" : "Mehrere Bestellungen auswählen"}
            className={
              selectMode
                ? "inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-medium rounded-md border border-brand bg-brand/[0.08] text-brand transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
                : "inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-medium rounded-md border border-line bg-surface text-foreground hover:bg-surface-hover hover:border-line-strong transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
            }
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
              {selectMode && <path d="M5 8.5l2 2 4-4.5" />}
            </svg>
            Auswählen
          </button>
          <SavedViewsMenu<ViewConfig>
            views={savedViews.views}
            activeViewId={activeViewId}
            currentConfigIsDirty={currentConfigIsDirty}
            onApply={(view) => applyView(view)}
            onSave={(name) => {
              const id = savedViews.saveView(name, currentConfig, false);
              setActiveViewId(id);
            }}
            onDelete={(id) => {
              savedViews.deleteView(id);
              if (activeViewId === id) setActiveViewId(null);
            }}
            onToggleDefault={(id) => savedViews.toggleDefault(id)}
          />
          <button
            type="button"
            onClick={() => {
              const rows = selected.size > 0 ? sorted.filter((b) => selected.has(b.id)) : sorted;
              handleCsvExport(rows);
            }}
            title={
              selected.size > 0
                ? `${selected.size} ausgewählte als CSV exportieren`
                : "Alle sichtbaren als CSV exportieren"
            }
            className="inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-medium rounded-md border border-line bg-surface text-foreground hover:bg-surface-hover hover:border-line-strong transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5 text-foreground-subtle"
              aria-hidden="true"
            >
              <path d="M3 11v1.5a1 1 0 001 1h8a1 1 0 001-1V11M5.5 7.5L8 10l2.5-2.5M8 10V2" />
            </svg>
            CSV
          </button>
        </FilterBar>
      </div>

      {/* Mobile: Status + Projekt filter below */}
      <div className="flex gap-3 mt-3 md:hidden">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="flex-1 px-3.5 py-2.5 bg-surface border border-line rounded-lg text-sm text-foreground focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)] transition-colors"
        >
          {STATUS_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {projekte.length > 0 && (
          <select
            value={projektFilter}
            onChange={(e) => setProjektFilter(e.target.value)}
            className="flex-1 px-3.5 py-2.5 bg-surface border border-line rounded-lg text-sm text-foreground focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)] transition-colors"
          >
            <option value="">Alle Projekte</option>
            {projekte.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Bulk toolbar — sticky-top, Linear-Style */}
      <div className="mt-4">
        <BulkToolbar
          count={selected.size}
          label="Bestellungen"
          onClear={() => setSelected(new Set())}
          totalHint={`von ${sorted.length} sichtbar`}
        >
          {(() => {
            const freigabeFaehig = bestellungen.filter(
              (b) => selected.has(b.id) && b.hat_rechnung && b.status !== "freigegeben",
            ).length;
            return (
              <Button
                size="sm"
                variant="primary"
                iconLeft={<IconCheck />}
                onClick={() => setShowFreigebenDialog(true)}
                loading={bulkFreigebenLoading}
                disabled={freigabeFaehig === 0}
                title={
                  freigabeFaehig === 0
                    ? "Keine der ausgewählten Bestellungen ist freigabe-fähig (Rechnung fehlt oder bereits freigegeben)"
                    : `${freigabeFaehig} Bestellung${freigabeFaehig === 1 ? "" : "en"} freigeben`
                }
              >
                Freigeben{freigabeFaehig > 0 ? ` (${freigabeFaehig})` : ""}
              </Button>
            );
          })()}
          <Button
            size="sm"
            variant="destructive"
            iconLeft={<IconTrash />}
            onClick={() => setShowDeleteDialog(true)}
            loading={deleteLoading}
          >
            Entfernen
          </Button>
        </BulkToolbar>
      </div>

      {/* DataTable */}
      <div className="mt-4">
        <DataTable<Bestellung>
          columns={columns}
          data={paginatedRows}
          getRowId={(b) => b.id}
          ariaLabel="Bestellübersicht"
          density={density}
          selection={selectMode ? selected : undefined}
          onSelectionChange={selectMode ? setSelected : undefined}
          getSelectionAriaLabel={(b) =>
            `Bestellung ${displayBestellnummer(b)} auswählen`
          }
          sort={sort}
          onSortChange={setSort}
          onRowClick={(b) => router.push(`/bestellungen/${b.id}`)}
          emptyState={
            bestellungen.length === 0 ? (
              <EmptyState
                tone="info"
                compact
                icon={
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                    />
                  </svg>
                }
                title="Noch keine Bestellungen"
                description="Bestellungen erscheinen automatisch sobald eine Dokumenten-E-Mail bei info@ eingeht oder die Chrome-Extension eine Bestellbestätigung erkennt."
              />
            ) : (
              <EmptyState
                tone="info"
                compact
                icon={<IconSearch className="w-5 h-5" />}
                title="Keine Treffer"
                description="Keine Bestellungen passen zu den aktuellen Filtern."
                primaryAction={
                  hasFilters ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSuche("");
                        setStatusFilter("");
                        setArtFilter("");
                        setProjektFilter("");
                      }}
                    >
                      Filter zurücksetzen
                    </Button>
                  ) : undefined
                }
              />
            )
          }
        />
      </div>

      {/* Pagination — basiert auf gefilterten Resultaten (sorted.length),
          NICHT totalCount. So sieht User die echten Pages für seine Filter. */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-foreground-subtle">
            {sorted.length === totalCount
              ? <>{totalCount} Bestellung{totalCount !== 1 ? "en" : ""} gesamt</>
              : <>{sorted.length} von {totalCount} Bestellungen sichtbar</>}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(safeCurrentPage - 1)}
              disabled={safeCurrentPage <= 1}
              className="p-2 text-sm font-medium bg-white border border-line rounded-lg hover:bg-input disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Vorherige Seite"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <span className="text-foreground-muted font-medium px-3 font-mono-amount text-xs">
              {safeCurrentPage} / {totalPages}
            </span>
            <button
              onClick={() => goToPage(safeCurrentPage + 1)}
              disabled={safeCurrentPage >= totalPages}
              className="p-2 text-sm font-medium bg-white border border-line rounded-lg hover:bg-input disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Nächste Seite"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={showDeleteDialog}
        onCancel={() => {
          setShowDeleteDialog(false);
          setDeleteLoading(false);
        }}
        onConfirm={handleBulkDelete}
        title="Bestellungen entfernen"
        message={`${selected.size} Bestellung${selected.size !== 1 ? "en" : ""} und alle zugehörigen Dokumente unwiderruflich löschen?`}
        confirmLabel={deleteLoading ? "Lösche..." : "Endgültig löschen"}
        variant="danger"
        loading={deleteLoading}
      />

      {/* Quick-Freigabe Bestätigung */}
      <ConfirmDialog
        open={!!freigabeConfirmId}
        onCancel={() => setFreigabeConfirmId(null)}
        onConfirm={() => freigabeConfirmId && handleQuickFreigabe(freigabeConfirmId)}
        title="Rechnung freigeben"
        message="Soll die Rechnung an die Buchhaltung freigegeben werden?"
        confirmLabel="Freigeben"
        variant="default"
      />

      {/* Bulk-Freigabe Bestätigung */}
      {(() => {
        const freigabeFaehig = bestellungen.filter(
          (b) => selected.has(b.id) && b.hat_rechnung && b.status !== "freigegeben",
        ).length;
        const skipped = selected.size - freigabeFaehig;
        return (
          <ConfirmDialog
            open={showFreigebenDialog}
            onCancel={() => {
              setShowFreigebenDialog(false);
              setBulkFreigebenLoading(false);
            }}
            onConfirm={handleBulkFreigeben}
            title="Bestellungen freigeben"
            message={
              skipped > 0
                ? `${freigabeFaehig} Bestellung${freigabeFaehig === 1 ? "" : "en"} freigeben und an die Buchhaltung übermitteln. ${skipped} ausgewählte werden übersprungen (keine Rechnung oder bereits freigegeben).`
                : `${freigabeFaehig} Bestellung${freigabeFaehig === 1 ? "" : "en"} freigeben und an die Buchhaltung übermitteln?`
            }
            confirmLabel={bulkFreigebenLoading ? "Gebe frei..." : "Freigeben"}
            variant="default"
            loading={bulkFreigebenLoading}
          />
        );
      })()}

      {/* PDF-Vorschau Modal */}
      {previewId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={closePreview}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-[90vw] max-w-4xl h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-line-subtle">
              <h3 className="font-headline text-sm text-foreground tracking-tight">
                PDF-Vorschau
              </h3>
              <button
                onClick={closePreview}
                className="p-1.5 rounded-lg text-foreground-subtle hover:text-foreground hover:bg-canvas transition-colors"
              >
                <IconX className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {previewUrl ? (
                <iframe
                  src={previewUrl}
                  className="w-full h-full border-0"
                  title="PDF-Vorschau"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-foreground-faint">
                  <svg
                    className="w-12 h-12"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                    />
                  </svg>
                  <p className="text-sm">Keine PDF verfügbar</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
