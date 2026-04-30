"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatBetrag, formatDatum } from "@/lib/formatters";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  DataTable,
  DensityToggle,
  useTableDensity,
  SavedViewsMenu,
  useSavedViews,
  Button,
  ActionMenu,
  EmptyState,
  type DataTableColumn,
  type SortState,
  type Density,
} from "@/components/ui";
import { exportToCsv, csvFilename } from "@/lib/export-csv";
import { deepEqual } from "@/lib/deep-equal";
import { IconEdit, IconPlus, IconFolderOpen } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

type ViewMode = "grid" | "table";

interface Projekt {
  id: string;
  name: string;
  beschreibung: string | null;
  status: string;
  farbe: string;
  budget: number | null;
  kunden_id: string | null;
  kunde: string | null;
  created_at: string;
}

interface KundeOption {
  id: string;
  name: string;
}

interface ProjektStats {
  gesamt: number;
  offen: number;
  volumen: number;
}

const FARBEN = [
  { hex: "#570006", label: "Rot" },
  { hex: "#2563eb", label: "Blau" },
  { hex: "#059669", label: "Grün" },
  { hex: "#d97706", label: "Amber" },
  { hex: "#7c3aed", label: "Violett" },
  { hex: "#0891b2", label: "Cyan" },
];

const STATUS_OPTIONS = [
  { value: "aktiv", label: "Aktiv", icon: "circle", color: "#059669", bg: "bg-success-bg", text: "text-success", border: "border-success-border" },
  { value: "pausiert", label: "Pausiert", icon: "pause", color: "#d97706", bg: "bg-warning-bg", text: "text-warning", border: "border-warning-border" },
  { value: "abgeschlossen", label: "Abgeschlossen", icon: "check", color: "#6b7280", bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-200" },
  { value: "archiviert", label: "Archivieren", icon: "archive", color: "#dc2626", bg: "bg-error-bg", text: "text-error", border: "border-error-border" },
];

function getStatusCfg(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];
}

function StatusIcon({ type, className }: { type: string; className?: string }) {
  const cls = className || "w-3 h-3";
  switch (type) {
    case "circle":
      return (
        <svg className={cls} viewBox="0 0 12 12" fill="currentColor">
          <circle cx="6" cy="6" r="4" />
        </svg>
      );
    case "pause":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6" />
        </svg>
      );
    case "check":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      );
    case "archive":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" />
        </svg>
      );
    default:
      return null;
  }
}

function StatusDropdown({
  currentStatus,
  onSelect,
  disabled,
}: {
  currentStatus: string;
  onSelect: (status: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cfg = getStatusCfg(currentStatus);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        disabled={disabled}
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border transition-all ${cfg.bg} ${cfg.text} ${cfg.border} ${disabled ? "opacity-50 cursor-not-allowed" : "hover:shadow-sm cursor-pointer"}`}
      >
        <StatusIcon type={cfg.icon} className="w-2.5 h-2.5" />
        {cfg.value === "archiviert" ? "Archiviert" : cfg.label}
        {!disabled && (
          <svg className={`w-2.5 h-2.5 ml-0.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-lg shadow-lg border border-line py-1 min-w-[160px]">
          {STATUS_OPTIONS.map((opt) => {
            const isActive = opt.value === currentStatus;
            return (
              <button
                key={opt.value}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  if (!isActive) onSelect(opt.value);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors ${
                  isActive
                    ? "bg-input font-semibold text-foreground"
                    : opt.value === "archiviert"
                      ? "text-error hover:bg-error-bg"
                      : "text-foreground-muted hover:bg-input"
                }`}
              >
                <span style={{ color: opt.color }}>
                  <StatusIcon type={opt.icon} className="w-3.5 h-3.5" />
                </span>
                <span>{opt.value === "archiviert" ? "Archivieren" : opt.label}</span>
                {isActive && (
                  <svg className="w-3 h-3 ml-auto text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ProjekteClient({
  projekte: initialProjekte,
  stats,
  kunden,
  istAdmin,
}: {
  projekte: Projekt[];
  stats: Record<string, ProjektStats>;
  kunden: KundeOption[];
  istAdmin: boolean;
}) {
  const router = useRouter();
  const [projekte, setProjekte] = useState(initialProjekte);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formBeschreibung, setFormBeschreibung] = useState("");
  const [formFarbe, setFormFarbe] = useState("#570006");
  const [formBudget, setFormBudget] = useState("");
  const [formKundenId, setFormKundenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [archivConfirmId, setArchivConfirmId] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);

  const aktive = projekte.filter((p) => p.status !== "archiviert" && p.status !== "abgeschlossen");
  const archiviert = projekte.filter((p) => p.status === "archiviert" || p.status === "abgeschlossen");

  // View state (P3 Stop 3)
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [density, setDensity] = useTableDensity("projekte.density");
  const [sort, setSort] = useState<SortState>({ key: "name", direction: "asc" });

  type ProjekteViewConfig = {
    viewMode: ViewMode;
    density: Density;
    sort: SortState;
  };
  const savedViews = useSavedViews<ProjekteViewConfig>("projekte");
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const didApplyDefault = useRef(false);
  useEffect(() => {
    if (didApplyDefault.current) return;
    if (savedViews.defaultView) {
      const d = savedViews.defaultView;
      setViewMode(d.config.viewMode);
      setDensity(d.config.density);
      setSort(d.config.sort);
      setActiveViewId(d.id);
    }
    didApplyDefault.current = true;
  }, [savedViews.defaultView, setDensity]);

  const currentConfig: ProjekteViewConfig = { viewMode, density, sort };
  const activeCfg =
    activeViewId && savedViews.views.find((v) => v.id === activeViewId)?.config;
  const currentConfigIsDirty = activeCfg ? !deepEqual(activeCfg, currentConfig) : false;

  function applyView(view: { id: string; config: ProjekteViewConfig }) {
    setViewMode(view.config.viewMode);
    setDensity(view.config.density);
    setSort(view.config.sort);
    setActiveViewId(view.id);
  }

  // Sorted + combined list for table view (aktive first, archiviert last, with dim)
  const tableRows = useMemo(() => {
    if (!sort) return aktive;
    const arr = [...aktive];
    const dir = sort.direction === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sort.key) {
        case "name":
          av = a.name.toLowerCase();
          bv = b.name.toLowerCase();
          break;
        case "kunde":
          av = (a.kunde || "").toLowerCase();
          bv = (b.kunde || "").toLowerCase();
          break;
        case "status":
          av = a.status;
          bv = b.status;
          break;
        case "budget":
          av = a.budget ?? 0;
          bv = b.budget ?? 0;
          break;
        case "volumen":
          av = stats[a.id]?.volumen ?? 0;
          bv = stats[b.id]?.volumen ?? 0;
          break;
        case "gesamt":
          av = stats[a.id]?.gesamt ?? 0;
          bv = stats[b.id]?.gesamt ?? 0;
          break;
        case "offen":
          av = stats[a.id]?.offen ?? 0;
          bv = stats[b.id]?.offen ?? 0;
          break;
        case "created_at":
          av = a.created_at;
          bv = b.created_at;
          break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [aktive, sort, stats]);

  function handleCsvExport() {
    exportToCsv(csvFilename("projekte"), tableRows, [
      { header: "Name", value: (p) => p.name },
      { header: "Status", value: (p) => p.status },
      { header: "Kunde", value: (p) => p.kunde ?? "" },
      { header: "Beschreibung", value: (p) => p.beschreibung ?? "" },
      { header: "Budget", value: (p) => p.budget ?? 0, numeric: true },
      { header: "Bestellungen gesamt", value: (p) => stats[p.id]?.gesamt ?? 0 },
      { header: "Bestellungen offen", value: (p) => stats[p.id]?.offen ?? 0 },
      { header: "Volumen", value: (p) => stats[p.id]?.volumen ?? 0, numeric: true },
      { header: "Angelegt", value: (p) => p.created_at.slice(0, 10) },
    ]);
  }

  const projektColumns: DataTableColumn<Projekt>[] = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (p) => (
        <Link
          href={`/bestellungen?projekt=${p.id}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-2 min-w-0 hover:text-brand transition-colors"
        >
          <span
            aria-hidden="true"
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: p.farbe }}
          />
          <span className="font-medium text-foreground truncate">{p.name}</span>
        </Link>
      ),
    },
    {
      key: "kunde",
      label: "Kunde",
      sortable: true,
      hideBelow: "md",
      className: "text-foreground-muted truncate max-w-[160px]",
      render: (p) => p.kunde ?? "–",
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (p) => {
        const cfg = getStatusCfg(p.status);
        return (
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide border",
              cfg.bg,
              cfg.text,
              cfg.border,
            )}
          >
            <StatusIcon type={cfg.icon} className="w-2.5 h-2.5" />
            {cfg.label}
          </span>
        );
      },
    },
    {
      key: "gesamt",
      label: "Bestellungen",
      sortable: true,
      align: "right",
      hideBelow: "sm",
      className: "font-mono-amount text-foreground-muted",
      render: (p) => {
        const s = stats[p.id] || { gesamt: 0, offen: 0, volumen: 0 };
        return (
          <span>
            {s.gesamt}
            {s.offen > 0 && (
              <span className="ml-1 text-[11px] text-warning">
                · {s.offen} offen
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "volumen",
      label: "Volumen",
      sortable: true,
      align: "right",
      className: "font-mono-amount font-semibold text-foreground",
      render: (p) => formatBetrag(stats[p.id]?.volumen ?? 0),
    },
    {
      key: "budget",
      label: "Budget",
      sortable: true,
      align: "right",
      hideBelow: "lg",
      className: "font-mono-amount text-foreground-muted",
      render: (p) => {
        if (!p.budget) return "–";
        const volumen = stats[p.id]?.volumen ?? 0;
        const prozent = p.budget > 0 ? (volumen / p.budget) * 100 : 0;
        return (
          <div className="inline-flex flex-col items-end gap-0.5">
            <span>{formatBetrag(p.budget)}</span>
            <span
              className={cn(
                "text-[10px]",
                prozent >= 100 ? "text-error" : prozent >= 80 ? "text-warning" : "text-foreground-subtle",
              )}
            >
              {prozent.toFixed(0)}%
            </span>
          </div>
        );
      },
    },
    {
      key: "created_at",
      label: "Angelegt",
      sortable: true,
      hideBelow: "xl",
      className: "text-foreground-subtle whitespace-nowrap",
      render: (p) => formatDatum(p.created_at),
    },
    {
      key: "actions",
      label: "",
      stopPropagation: true,
      align: "right",
      width: 56,
      render: (p) =>
        istAdmin ? (
          <ActionMenu
            label={`Aktionen für ${p.name}`}
            items={[
              {
                label: "Bearbeiten",
                icon: <IconEdit />,
                onSelect: () => openEdit(p),
              },
            ]}
          />
        ) : null,
    },
  ];

  const resetForm = useCallback(() => {
    setShowForm(false);
    setEditId(null);
    setFormName("");
    setFormBeschreibung("");
    setFormFarbe("#570006");
    setFormBudget("");
    setFormKundenId(null);
    setError("");
  }, []);

  const openEdit = useCallback((p: Projekt) => {
    setEditId(p.id);
    setFormName(p.name);
    setFormBeschreibung(p.beschreibung || "");
    setFormFarbe(p.farbe);
    setFormBudget(p.budget?.toString() || "");
    setFormKundenId(p.kunden_id);
    setShowForm(true);
  }, []);

  const handleSave = async () => {
    if (!formName.trim() || formName.trim().length < 2) {
      setError("Name muss mindestens 2 Zeichen lang sein");
      return;
    }
    setSaving(true);
    setError("");

    try {
      const payload = {
        name: formName.trim(),
        beschreibung: formBeschreibung.trim() || null,
        farbe: formFarbe,
        budget: formBudget ? Number(formBudget) : null,
        kunden_id: formKundenId || null,
      };

      const res = await fetch(
        editId ? `/api/projekte/${editId}` : "/api/projekte",
        {
          method: editId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Fehler beim Speichern");
        return;
      }

      const data = await res.json();
      const saved = data.projekt as Projekt;

      if (editId) {
        setProjekte((prev) => prev.map((p) => (p.id === editId ? saved : p)));
      } else {
        setProjekte((prev) => [...prev, saved]);
      }

      resetForm();
      router.refresh();
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (projektId: string, newStatus: string) => {
    // Archivieren braucht Bestätigung
    if (newStatus === "archiviert") {
      setArchivConfirmId(projektId);
      return;
    }
    await updateStatus(projektId, newStatus);
  };

  const updateStatus = async (projektId: string, newStatus: string) => {
    setStatusUpdating(projektId);
    try {
      const res = await fetch(`/api/projekte/${projektId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        const data = await res.json();
        const saved = data.projekt as Projekt;
        setProjekte((prev) => prev.map((p) => (p.id === projektId ? saved : p)));
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Status konnte nicht geändert werden");
      }
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setStatusUpdating(null);
    }
  };

  const handleArchivConfirm = async () => {
    if (!archivConfirmId) return;
    await updateStatus(archivConfirmId, "archiviert");
    setArchivConfirmId(null);
  };

  const getBudgetPercent = (projektId: string, budget: number | null) => {
    if (!budget || budget <= 0) return null;
    const volumen = stats[projektId]?.volumen || 0;
    return Math.min(100, (volumen / budget) * 100);
  };

  const getBudgetColor = (percent: number) => {
    if (percent < 70) return "#059669";
    if (percent < 90) return "#d97706";
    return "#dc2626";
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
        <div>
          <h1 className="font-headline text-2xl text-foreground tracking-tight">Projekte</h1>
          <p className="text-foreground-subtle text-sm mt-1">
            {aktive.length} aktiv{archiviert.length > 0 ? ` · ${archiviert.length} archiviert` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View-Mode Toggle */}
          <div
            role="radiogroup"
            aria-label="Ansicht"
            className="inline-flex bg-input border border-line rounded-md p-0.5"
          >
            <button
              type="button"
              role="radio"
              aria-checked={viewMode === "grid"}
              onClick={() => setViewMode("grid")}
              title="Karten-Ansicht"
              className={cn(
                "px-2 h-7 text-[11px] font-semibold rounded transition-colors",
                "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
                viewMode === "grid"
                  ? "bg-surface text-foreground shadow-card"
                  : "text-foreground-subtle hover:text-foreground-muted",
              )}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
                <rect x="2" y="2" width="5" height="5" rx="1" />
                <rect x="9" y="2" width="5" height="5" rx="1" />
                <rect x="2" y="9" width="5" height="5" rx="1" />
                <rect x="9" y="9" width="5" height="5" rx="1" />
              </svg>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={viewMode === "table"}
              onClick={() => setViewMode("table")}
              title="Tabellen-Ansicht"
              className={cn(
                "px-2 h-7 text-[11px] font-semibold rounded transition-colors",
                "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
                viewMode === "table"
                  ? "bg-surface text-foreground shadow-card"
                  : "text-foreground-subtle hover:text-foreground-muted",
              )}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" className="h-3.5 w-3.5">
                <path d="M2 4h12M2 8h12M2 12h12" />
              </svg>
            </button>
          </div>

          {viewMode === "table" && (
            <DensityToggle density={density} onChange={setDensity} />
          )}

          <SavedViewsMenu<ProjekteViewConfig>
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
            onClick={handleCsvExport}
            disabled={tableRows.length === 0}
            title="Projekte als CSV exportieren"
            className="inline-flex items-center gap-1.5 h-9 px-3 text-[13px] font-medium rounded-md border border-line bg-surface text-foreground hover:bg-surface-hover hover:border-line-strong transition-colors focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] disabled:opacity-50 disabled:cursor-not-allowed"
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

          {istAdmin && (
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="btn-primary px-4 py-2.5 rounded-lg text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Neues Projekt
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && !showForm && (
        <div className="mb-4 flex items-center justify-between gap-2 px-3 py-2 bg-error-bg border border-error-border rounded-lg text-xs text-error">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="text-red-400 hover:text-error shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Form Modal — no status field, status is managed via card dropdown */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={resetForm}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-line">
              <div className="flex items-center justify-between">
                <h2 className="font-headline text-lg text-foreground tracking-tight">{editId ? "Projekt bearbeiten" : "Neues Projekt"}</h2>
                <button onClick={resetForm} className="p-1 text-foreground-subtle hover:text-foreground transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase mb-1.5">Name *</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-line rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand/30"
                  placeholder="z.B. Umbau Müller Garage"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase mb-1.5">Beschreibung</label>
                <textarea
                  value={formBeschreibung}
                  onChange={(e) => setFormBeschreibung(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-white border border-line rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand/30 resize-none"
                  placeholder="Optionale Beschreibung..."
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase mb-1.5">Farbe</label>
                <div className="flex gap-2">
                  {FARBEN.map((f) => (
                    <button
                      key={f.hex}
                      type="button"
                      onClick={() => setFormFarbe(f.hex)}
                      className={`w-8 h-8 rounded-lg transition-all ${
                        formFarbe === f.hex ? "ring-2 ring-offset-2" : "hover:scale-110"
                      }`}
                      style={{
                        background: f.hex,
                        ...(formFarbe === f.hex ? { ["--tw-ring-color" as string]: f.hex } : {}),
                      }}
                      title={f.label}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase mb-1.5">Kunde</label>
                <select
                  value={formKundenId || ""}
                  onChange={(e) => setFormKundenId(e.target.value || null)}
                  className="w-full px-3 py-2 bg-white border border-line rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand/30"
                >
                  <option value="">Kein Kunde zugeordnet</option>
                  {kunden.map((k) => (
                    <option key={k.id} value={k.id}>{k.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase mb-1.5">Budget (EUR)</label>
                <input
                  type="number"
                  value={formBudget}
                  onChange={(e) => setFormBudget(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-line rounded-lg text-sm text-foreground font-mono-amount focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand/30"
                  placeholder="Optional"
                  min="0"
                  step="0.01"
                />
              </div>

              {error && <p className="text-error text-sm">{error}</p>}
            </div>

            <div className="p-6 border-t border-line flex justify-end gap-3">
              <button
                onClick={resetForm}
                className="px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary px-4 py-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Speichert..." : editId ? "Änderungen speichern" : "Projekt anlegen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Projekt-Grid */}
      {aktive.length === 0 ? (
        <EmptyState
          tone="info"
          icon={<IconFolderOpen className="w-5 h-5" />}
          title="Noch keine Projekte"
          description="Projekte gruppieren Bestellungen und Budgets. Lege das erste Projekt an, um Bestellungen zuordnen zu können."
          primaryAction={
            istAdmin ? (
              <Button
                size="sm"
                onClick={() => {
                  resetForm();
                  setShowForm(true);
                }}
                iconLeft={<IconPlus />}
              >
                Erstes Projekt erstellen
              </Button>
            ) : undefined
          }
        />
      ) : viewMode === "table" ? (
        <DataTable<Projekt>
          columns={projektColumns}
          data={tableRows}
          getRowId={(p) => p.id}
          ariaLabel="Projekt-Liste"
          density={density}
          sort={sort}
          onSortChange={setSort}
          onRowClick={(p) => router.push(`/bestellungen?projekt=${p.id}`)}
          emptyState={
            <EmptyState
              tone="info"
              compact
              icon={<IconFolderOpen className="w-5 h-5" />}
              title="Keine aktiven Projekte"
              description="Aktive Projekte erscheinen hier. Abgeschlossene und pausierte Projekte findest du im Archiv."
            />
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {aktive.map((p) => {
            const s = stats[p.id] || { gesamt: 0, offen: 0, volumen: 0 };
            const budgetPercent = getBudgetPercent(p.id, p.budget);

            return (
              <div
                key={p.id}
                className="card card-hover relative overflow-hidden"
                style={{ borderLeft: `4px solid ${p.farbe}` }}
              >
                {/* Gradient overlay */}
                <div
                  className="absolute top-0 left-0 right-0 h-20 opacity-[0.04] pointer-events-none"
                  style={{ background: `linear-gradient(180deg, ${p.farbe}, transparent)` }}
                />

                <div className="p-5 relative">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-1">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-headline text-base text-foreground truncate">{p.name}</h3>
                    </div>
                    <div className="flex items-center gap-1.5 ml-2 shrink-0">
                      {istAdmin ? (
                        <>
                          <StatusDropdown
                            currentStatus={p.status}
                            onSelect={(s) => handleStatusChange(p.id, s)}
                            disabled={statusUpdating === p.id}
                          />
                          <button
                            onClick={() => openEdit(p)}
                            className="p-1 rounded hover:bg-canvas transition-colors text-foreground-faint hover:text-brand"
                            title="Bearbeiten"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        </>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border ${getStatusCfg(p.status).bg} ${getStatusCfg(p.status).text} ${getStatusCfg(p.status).border}`}>
                          <StatusIcon type={getStatusCfg(p.status).icon} className="w-2.5 h-2.5" />
                          {getStatusCfg(p.status).label}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Kunde */}
                  {p.kunde && (
                    <p className="text-[11px] text-foreground-subtle mt-0.5 truncate">{p.kunde}</p>
                  )}

                  {/* Description */}
                  {p.beschreibung && (
                    <p className="text-xs text-foreground-muted line-clamp-2 mb-3">{p.beschreibung}</p>
                  )}

                  {/* Stats — structured grid */}
                  <div className="grid grid-cols-3 gap-2 mt-3 p-3 bg-input rounded-lg border border-line-subtle">
                    <div>
                      <p className="text-[10px] text-foreground-subtle uppercase tracking-wider font-semibold">Bestell.</p>
                      <p className="font-mono-amount text-sm font-semibold text-foreground mt-0.5">{s.gesamt}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-foreground-subtle uppercase tracking-wider font-semibold">Volumen</p>
                      <p className="font-mono-amount text-sm font-semibold text-foreground mt-0.5">{formatBetrag(s.volumen)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-foreground-subtle uppercase tracking-wider font-semibold">Offen</p>
                      <p className={`font-mono-amount text-sm font-semibold mt-0.5 ${s.offen > 0 ? "text-brand" : "text-foreground-faint"}`}>
                        {s.offen}
                      </p>
                    </div>
                  </div>

                  {/* Budget Bar */}
                  {budgetPercent !== null && p.budget && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className="text-foreground-subtle uppercase tracking-wider font-semibold">Budget</span>
                        <span className="font-mono-amount text-foreground-muted">{formatBetrag(s.volumen)} / {formatBetrag(p.budget)}</span>
                      </div>
                      <div className="h-1.5 bg-line rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${budgetPercent}%`,
                            background: getBudgetColor(budgetPercent),
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="mt-4 pt-3 border-t border-line-subtle flex items-center justify-between">
                    <span className="text-[10px] text-foreground-faint">{formatDatum(p.created_at)}</span>
                    <Link
                      href={`/bestellungen?projekt_id=${p.id}`}
                      className="inline-flex items-center gap-1 text-xs text-brand hover:text-brand-light font-medium transition-colors group/link"
                    >
                      Bestellungen
                      <svg className="w-3 h-3 transition-transform group-hover/link:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Link zum Archiv */}
      {archiviert.length > 0 && (
        <div className="mt-8">
          <Link
            href="/archiv"
            className="flex items-center gap-2 text-sm text-foreground-subtle hover:text-brand transition-colors group"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
            </svg>
            <span className="font-medium">{archiviert.length} archivierte Projekte im Archiv ansehen</span>
            <svg className="w-3 h-3 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </Link>
        </div>
      )}

      {/* Archiv Confirm */}
      <ConfirmDialog
        open={!!archivConfirmId}
        onCancel={() => setArchivConfirmId(null)}
        onConfirm={handleArchivConfirm}
        title="Projekt archivieren?"
        message="Das Projekt wird archiviert und erscheint im Archiv. Bestehende Bestellungen behalten ihre Zuordnung. Du kannst den Status jederzeit zurücksetzen."
        confirmLabel="Archivieren"
      />
    </div>
  );
}
