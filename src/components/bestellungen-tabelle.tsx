"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getStatusConfig } from "@/lib/status-config";
import { formatDatum, formatBetrag } from "@/lib/formatters";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  DataTable,
  DensityToggle,
  useTableDensity,
  BulkToolbar,
  Button,
  Badge,
  SavedViewsMenu,
  useSavedViews,
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
import type { Bestellungsart } from "@/lib/bestellung-utils";

interface Bestellung {
  id: string;
  bestellnummer: string | null;
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
}

interface ProjektOption {
  id: string;
  name: string;
  farbe: string;
}

type ArtFilter = "" | "material" | "subunternehmer" | "abo";

const STATUS_OPTIONS = [
  { value: "", label: "Alle Status" },
  { value: "offen", label: "Offen" },
  { value: "vollstaendig", label: "Vollständig" },
  { value: "abweichung", label: "Abweichung" },
  { value: "ls_fehlt", label: "LS fehlt" },
  { value: "freigegeben", label: "Freigegeben" },
];

function DokumentIcon({
  vorhanden,
  onClick,
  onMouseEnter,
}: {
  vorhanden: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
}) {
  if (vorhanden && onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        className="p-1 -m-1 rounded-md transition-all hover:bg-green-50 hover:scale-125 cursor-pointer group/dok"
        title="Klicken für Vorschau"
      >
        <IconCheck className="w-4 h-4 text-green-600 group-hover/dok:text-green-700" />
      </button>
    );
  }
  return vorhanden ? (
    <IconCheck className="w-4 h-4 text-green-600" />
  ) : (
    <div className="w-4 h-4 rounded-full border-2 border-line-strong" aria-hidden="true" />
  );
}

export function BestellungenTabelle({
  bestellungen,
  currentPage,
  totalPages,
  totalCount,
  projekte = [],
  aktiverProjektFilter,
  aktiverProjektName,
}: {
  bestellungen: Bestellung[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
  projekte?: ProjektOption[];
  aktiverProjektFilter?: string | null;
  aktiverProjektName?: string | null;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Filters
  const [suche, setSuche] = useState("");
  const [statusFilter, setStatusFilter] = useState("offen");
  const [artFilter, setArtFilter] = useState<ArtFilter>("");
  const [projektFilter, setProjektFilter] = useState(aktiverProjektFilter || "");
  useEffect(() => {
    setProjektFilter(aktiverProjektFilter || "");
  }, [aktiverProjektFilter]);

  // Table state
  const [density, setDensity] = useTableDensity("bestellungen.density");
  const [sort, setSort] = useState<SortState>({ key: "created_at", direction: "desc" });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Saved Views — shape of what's persisted per view
  type ViewConfig = {
    suche: string;
    statusFilter: string;
    artFilter: ArtFilter;
    projektFilter: string;
    density: Density;
    sort: SortState;
  };
  const savedViews = useSavedViews<ViewConfig>("bestellungen");
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  // Auto-apply default view on first mount (once)
  const didApplyDefault = useRef(false);
  useEffect(() => {
    if (didApplyDefault.current) return;
    if (savedViews.defaultView) {
      const d = savedViews.defaultView;
      setSuche(d.config.suche);
      setStatusFilter(d.config.statusFilter);
      setArtFilter(d.config.artFilter);
      setProjektFilter(d.config.projektFilter);
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
    density,
    sort,
  };

  function applyView(view: { id: string; config: ViewConfig }) {
    setSuche(view.config.suche);
    setStatusFilter(view.config.statusFilter);
    setArtFilter(view.config.artFilter);
    setProjektFilter(view.config.projektFilter);
    setDensity(view.config.density);
    setSort(view.config.sort);
    setActiveViewId(view.id);
  }

  const activeViewConfig =
    activeViewId && savedViews.views.find((v) => v.id === activeViewId)?.config;
  const currentConfigIsDirty = activeViewConfig
    ? JSON.stringify(activeViewConfig) !== JSON.stringify(currentConfig)
    : false;

  // Async UI state
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [freigabeLoadingId, setFreigabeLoadingId] = useState<string | null>(null);
  const [freigabeConfirmId, setFreigabeConfirmId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewCache = useRef<Map<string, string>>(new Map());

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
        const suchMatch =
          !suche ||
          b.bestellnummer?.toLowerCase().includes(suche.toLowerCase()) ||
          b.haendler_name?.toLowerCase().includes(suche.toLowerCase()) ||
          b.besteller_name?.toLowerCase().includes(suche.toLowerCase());

        const statusMatch =
          !statusFilter ||
          (statusFilter === "offen" ? b.status !== "freigegeben" : b.status === statusFilter);
        const artMatch = !artFilter || (b.bestellungsart || "material") === artFilter;
        const projektMatch = !projektFilter || b.projekt_id === projektFilter;

        return suchMatch && statusMatch && artMatch && projektMatch;
      }),
    [bestellungen, suche, statusFilter, artFilter, projektFilter],
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
          av = a.bestellnummer ?? "";
          bv = b.bestellnummer ?? "";
          break;
        case "haendler_name":
          av = (a.haendler_name || "").toLowerCase();
          bv = (b.haendler_name || "").toLowerCase();
          break;
        case "created_at":
          av = a.created_at;
          bv = b.created_at;
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

  const hasFilters = suche || statusFilter || artFilter || projektFilter;

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", page.toString());
    router.push(`/bestellungen?${params.toString()}`);
  }

  async function handleQuickFreigabe(bestellungId: string) {
    setFreigabeConfirmId(null);
    setFreigabeLoadingId(bestellungId);
    try {
      const res = await fetch(`/api/bestellungen/${bestellungId}/freigeben`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) router.refresh();
    } catch {
      window.alert("Freigabe fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setFreigabeLoadingId(null);
    }
  }

  const fetchSignedUrl = useCallback(
    async (bestellungId: string, typ: string): Promise<string | null> => {
      const cacheKey = `${bestellungId}:${typ}`;
      const cached = previewCache.current.get(cacheKey);
      if (cached) return cached;
      try {
        const res = await fetch(
          `/api/pdfs/${bestellungId}?typ=${encodeURIComponent(typ)}&mode=url`,
        );
        if (res.ok) {
          const { url } = await res.json();
          if (url) {
            previewCache.current.set(cacheKey, url);
            setTimeout(() => previewCache.current.delete(cacheKey), 240_000);
            return url;
          }
        }
      } catch {
        /* ignore */
      }
      return null;
    },
    [],
  );

  function preloadPreview(bestellungId: string, typ: string) {
    fetchSignedUrl(bestellungId, typ);
  }

  async function handlePreview(bestellungId: string, typ: string) {
    setPreviewId(bestellungId);
    setPreviewUrl(null);
    setPreviewLoading(true);
    const url = await fetchSignedUrl(bestellungId, typ);
    setPreviewUrl(url);
    setPreviewLoading(false);
  }

  function closePreview() {
    setPreviewId(null);
    setPreviewUrl(null);
  }

  async function downloadZip(bestellungId: string) {
    setDownloadingId(bestellungId);
    try {
      const res = await fetch(`/api/pdfs/zip?bestellung_id=${bestellungId}`);
      if (!res.ok) {
        window.alert("Fehler beim Herunterladen der Dokumente.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="?([^"]+)"?/);
      link.download = match?.[1] || "Dokumente.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      window.alert("Fehler beim Herunterladen der Dokumente.");
    } finally {
      setDownloadingId(null);
    }
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
        setSelected(new Set());
        setShowDeleteDialog(false);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "Fehler beim Löschen der Bestellungen");
      }
    } catch {
      window.alert("Netzwerkfehler beim Löschen der Bestellungen");
    } finally {
      setDeleteLoading(false);
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
            {b.bestellnummer || "–"}
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
        render: (b) => formatDatum(b.created_at),
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
        render: (b) => {
          const status = getStatusConfig(b.status);
          return (
            <span
              className={`status-tag ${status.bg} ${status.text}`}
              style={{ position: "relative" }}
            >
              <span
                aria-hidden="true"
                className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-sm"
                style={{ background: status.color }}
              />
              {status.label}
            </span>
          );
        },
      },
      {
        key: "betrag",
        label: "Betrag",
        sortable: true,
        align: "right",
        className: "font-mono-amount font-semibold",
        render: (b) => (
          <>
            {formatBetrag(b.betrag, b.waehrung)}
            {b.betrag_ist_netto && b.betrag != null && (
              <span className="text-[10px] text-foreground-subtle ml-1">netto</span>
            )}
          </>
        ),
      },
      {
        key: "actions",
        label: "",
        stopPropagation: true,
        width: 90,
        align: "right",
        render: (b) => (
          <div className="flex items-center justify-end gap-1">
            {b.status !== "freigegeben" && b.hat_rechnung && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFreigabeConfirmId(b.id);
                }}
                disabled={freigabeLoadingId === b.id}
                className={`p-1.5 rounded-md transition-colors inline-flex ${
                  freigabeLoadingId === b.id
                    ? "text-emerald-600 animate-pulse"
                    : "text-foreground-faint group-hover:text-foreground-subtle hover:!text-emerald-600 hover:!bg-emerald-50"
                }`}
                title="Rechnung freigeben"
              >
                <IconCheck className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                downloadZip(b.id);
              }}
              disabled={downloadingId === b.id}
              className={`p-1.5 rounded-md transition-colors inline-flex ${
                downloadingId === b.id
                  ? "text-brand animate-pulse"
                  : "text-foreground-faint group-hover:text-foreground-subtle hover:!text-brand hover:!bg-brand/[0.06]"
              }`}
              title="Alle Dokumente herunterladen"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="w-4 h-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
            </button>
          </div>
        ),
      },
    ],
    [projektFarbenMap, freigabeLoadingId, downloadingId],
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
        <div className="flex items-center gap-1 p-1 bg-canvas rounded-lg shrink-0">
          {(
            [
              { key: "" as ArtFilter, label: "Alle" },
              { key: "material" as ArtFilter, label: "Material" },
              { key: "subunternehmer" as ArtFilter, label: "Subunternehmer" },
              { key: "abo" as ArtFilter, label: "Abo" },
            ]
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setArtFilter(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
                artFilter === tab.key
                  ? "bg-white text-foreground shadow-sm"
                  : "text-foreground-muted hover:text-foreground"
              }`}
            >
              {tab.label}
              {tab.key && artCounts[tab.key] > 0 && (
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                    artFilter === tab.key
                      ? "bg-brand text-white"
                      : "bg-line text-foreground-muted"
                  }`}
                >
                  {artCounts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 min-w-0">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-subtle pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Suchen… (Taste /)"
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-line rounded-lg text-sm text-foreground placeholder-foreground-faint focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand/30 transition-colors"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="hidden md:block px-3.5 py-2.5 bg-white border border-line rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand/30 transition-colors"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {projekte.length > 0 && (
            <select
              value={projektFilter}
              onChange={(e) => setProjektFilter(e.target.value)}
              className="hidden md:block px-3.5 py-2.5 bg-white border border-line rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand/30 transition-colors"
            >
              <option value="">Alle Projekte</option>
              {projekte.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setSuche("");
                setStatusFilter("");
                setArtFilter("");
                setProjektFilter("");
              }}
              className="p-2.5 text-foreground-subtle hover:text-brand hover:bg-red-50 rounded-lg border border-line transition-colors shrink-0"
              title="Filter zurücksetzen"
            >
              <IconX className="w-4 h-4" />
            </button>
          )}
          <DensityToggle density={density} onChange={setDensity} />
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
        </div>
      </div>

      {/* Mobile: Status + Projekt filter below */}
      <div className="flex gap-3 mt-3 md:hidden">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="flex-1 px-3.5 py-2.5 bg-white border border-line rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand/30 transition-colors"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {projekte.length > 0 && (
          <select
            value={projektFilter}
            onChange={(e) => setProjektFilter(e.target.value)}
            className="flex-1 px-3.5 py-2.5 bg-white border border-line rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand/30 transition-colors"
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
          data={sorted}
          getRowId={(b) => b.id}
          ariaLabel="Bestellübersicht"
          density={density}
          selection={selected}
          onSelectionChange={setSelected}
          getSelectionAriaLabel={(b) =>
            `Bestellung ${b.bestellnummer || "ohne Nummer"} auswählen`
          }
          sort={sort}
          onSortChange={setSort}
          onRowClick={(b) => router.push(`/bestellungen/${b.id}`)}
          emptyState={
            <div className="flex flex-col items-center gap-2">
              <svg
                className="w-8 h-8 text-line-strong"
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
              <p className="text-foreground-subtle text-sm">
                {bestellungen.length === 0
                  ? "Noch keine Bestellungen vorhanden."
                  : "Keine Bestellungen gefunden."}
              </p>
              {hasFilters && (
                <button
                  onClick={() => {
                    setSuche("");
                    setStatusFilter("");
                    setArtFilter("");
                    setProjektFilter("");
                  }}
                  className="text-brand hover:text-brand-light text-sm font-medium transition-colors"
                >
                  Filter zurücksetzen
                </button>
              )}
            </div>
          }
        />
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-foreground-subtle">
            {totalCount} Bestellung{totalCount !== 1 ? "en" : ""} gesamt
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
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
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
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
              {previewLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="spinner w-8 h-8 text-brand" />
                </div>
              ) : previewUrl ? (
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
