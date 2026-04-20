"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { formatBetrag, formatDatum } from "@/lib/formatters";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  DataTable,
  DensityToggle,
  useTableDensity,
  SavedViewsMenu,
  useSavedViews,
  Badge,
  Button,
  ActionMenu,
  EmptyState,
  type DataTableColumn,
  type SortState,
  type Density,
} from "@/components/ui";
import { exportToCsv, csvFilename } from "@/lib/export-csv";
import { IconCheck, IconEdit, IconTrash, IconPlus, IconUsers } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

type ViewMode = "grid" | "table";

interface Kunde {
  id: string;
  name: string;
  kuerzel: string | null;
  adresse: string | null;
  email: string | null;
  telefon: string | null;
  notizen: string | null;
  keywords: string[];
  farbe: string;
  confirmed_at: string | null;
  created_at: string;
}

interface KundeStats {
  projekte: number;
  bestellungen: number;
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

export function KundenClient({
  kunden: initialKunden,
  stats,
  istAdmin,
}: {
  kunden: Kunde[];
  stats: Record<string, KundeStats>;
  istAdmin: boolean;
}) {
  const router = useRouter();
  const [kunden, setKunden] = useState(initialKunden);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState<string | null>(null);

  // View state (P3 Stop 3 — table/grid toggle, density, sort, saved views)
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [density, setDensity] = useTableDensity("kunden.density");
  const [sort, setSort] = useState<SortState>({ key: "name", direction: "asc" });

  type KundenViewConfig = {
    viewMode: ViewMode;
    density: Density;
    sort: SortState;
  };
  const savedViews = useSavedViews<KundenViewConfig>("kunden");
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

  const currentConfig: KundenViewConfig = { viewMode, density, sort };
  const activeCfg =
    activeViewId && savedViews.views.find((v) => v.id === activeViewId)?.config;
  const currentConfigIsDirty = activeCfg
    ? JSON.stringify(activeCfg) !== JSON.stringify(currentConfig)
    : false;

  // Form state
  const [formName, setFormName] = useState("");
  const [formKuerzel, setFormKuerzel] = useState("");
  const [formAdresse, setFormAdresse] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formTelefon, setFormTelefon] = useState("");
  const [formNotizen, setFormNotizen] = useState("");
  const [formKeywords, setFormKeywords] = useState<string[]>([]);
  const [formKeywordInput, setFormKeywordInput] = useState("");
  const [formFarbe, setFormFarbe] = useState("#2563eb");

  const resetForm = useCallback(() => {
    setShowForm(false);
    setEditId(null);
    setFormName("");
    setFormKuerzel("");
    setFormAdresse("");
    setFormEmail("");
    setFormTelefon("");
    setFormNotizen("");
    setFormKeywords([]);
    setFormKeywordInput("");
    setFormFarbe("#2563eb");
    setError("");
  }, []);

  const openEdit = useCallback((k: Kunde) => {
    setEditId(k.id);
    setFormName(k.name);
    setFormKuerzel(k.kuerzel || "");
    setFormAdresse(k.adresse || "");
    setFormEmail(k.email || "");
    setFormTelefon(k.telefon || "");
    setFormNotizen(k.notizen || "");
    setFormKeywords(k.keywords || []);
    setFormFarbe(k.farbe || "#2563eb");
    setShowForm(true);
  }, []);

  const handleKeywordAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const kw = formKeywordInput.trim().toLowerCase();
      if (kw && !formKeywords.includes(kw)) {
        setFormKeywords((prev) => [...prev, kw]);
      }
      setFormKeywordInput("");
    }
  };

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
        kuerzel: formKuerzel.trim() || null,
        adresse: formAdresse.trim() || null,
        email: formEmail.trim() || null,
        telefon: formTelefon.trim() || null,
        notizen: formNotizen.trim() || null,
        keywords: formKeywords,
        farbe: formFarbe,
      };

      const res = await fetch(
        editId ? `/api/kunden/${editId}` : "/api/kunden",
        {
          method: editId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Fehler beim Speichern");
        return;
      }

      const data = await res.json();
      const saved = data.kunde as Kunde;

      if (editId) {
        setKunden((prev) => prev.map((k) => (k.id === editId ? saved : k)));
      } else {
        setKunden((prev) => [...prev, saved]);
      }

      resetForm();
      router.refresh();
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const res = await fetch(`/api/kunden/${deleteConfirm.id}`, { method: "DELETE" });
      if (res.ok) {
        setKunden((prev) => prev.filter((k) => k.id !== deleteConfirm.id));
        setDeleteConfirm(null);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Kunde konnte nicht gelöscht werden");
        setDeleteConfirm(null);
      }
    } catch {
      setError("Netzwerkfehler beim Löschen");
      setDeleteConfirm(null);
    }
  };

  const handleBestaetigen = async (kundeId: string) => {
    setConfirmLoading(kundeId);
    try {
      const res = await fetch(`/api/kunden/${kundeId}/bestaetigen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        setKunden((prev) =>
          prev.map((k) => (k.id === kundeId ? { ...k, confirmed_at: new Date().toISOString() } : k))
        );
      }
    } finally {
      setConfirmLoading(null);
    }
  };

  const bestaetigt = kunden.filter((k) => k.confirmed_at);
  const unbestaetigt = kunden.filter((k) => !k.confirmed_at);

  // Client-side sort (table mode only — card grid stays in DB order)
  const bestaetigtSorted = useMemo(() => {
    if (!sort) return bestaetigt;
    const arr = [...bestaetigt];
    const dir = sort.direction === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sort.key) {
        case "name":
          av = a.name.toLowerCase();
          bv = b.name.toLowerCase();
          break;
        case "kuerzel":
          av = (a.kuerzel || "").toLowerCase();
          bv = (b.kuerzel || "").toLowerCase();
          break;
        case "projekte":
          av = stats[a.id]?.projekte ?? 0;
          bv = stats[b.id]?.projekte ?? 0;
          break;
        case "bestellungen":
          av = stats[a.id]?.bestellungen ?? 0;
          bv = stats[b.id]?.bestellungen ?? 0;
          break;
        case "volumen":
          av = stats[a.id]?.volumen ?? 0;
          bv = stats[b.id]?.volumen ?? 0;
          break;
        case "created_at":
          av = a.created_at;
          bv = b.created_at;
          break;
        default:
          return 0;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [bestaetigt, sort, stats]);

  function handleCsvExport() {
    exportToCsv(csvFilename("kunden"), bestaetigtSorted, [
      { header: "Name", value: (k) => k.name },
      { header: "Kürzel", value: (k) => k.kuerzel ?? "" },
      { header: "Adresse", value: (k) => k.adresse ?? "" },
      { header: "E-Mail", value: (k) => k.email ?? "" },
      { header: "Telefon", value: (k) => k.telefon ?? "" },
      { header: "Projekte", value: (k) => stats[k.id]?.projekte ?? 0 },
      { header: "Bestellungen", value: (k) => stats[k.id]?.bestellungen ?? 0 },
      { header: "Volumen", value: (k) => stats[k.id]?.volumen ?? 0, numeric: true },
      { header: "Keywords", value: (k) => k.keywords.join(", ") },
      { header: "Angelegt", value: (k) => k.created_at.slice(0, 10) },
    ]);
  }

  function applyView(view: { id: string; config: KundenViewConfig }) {
    setViewMode(view.config.viewMode);
    setDensity(view.config.density);
    setSort(view.config.sort);
    setActiveViewId(view.id);
  }

  const kundenColumns: DataTableColumn<Kunde>[] = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (k) => (
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden="true"
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: k.farbe }}
          />
          <span className="font-medium text-foreground truncate">{k.name}</span>
          {k.kuerzel && (
            <span className="text-[11px] font-mono-amount text-foreground-subtle">
              {k.kuerzel}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "adresse",
      label: "Adresse",
      hideBelow: "md",
      className: "text-foreground-muted truncate max-w-[220px]",
      render: (k) => k.adresse ?? "–",
    },
    {
      key: "email",
      label: "E-Mail",
      hideBelow: "lg",
      className: "text-foreground-muted truncate max-w-[180px]",
      render: (k) => k.email ?? "–",
    },
    {
      key: "projekte",
      label: "Projekte",
      sortable: true,
      align: "right",
      className: "font-mono-amount text-foreground-muted",
      hideBelow: "sm",
      render: (k) => stats[k.id]?.projekte ?? 0,
    },
    {
      key: "bestellungen",
      label: "Bestellungen",
      sortable: true,
      align: "right",
      className: "font-mono-amount text-foreground-muted",
      hideBelow: "sm",
      render: (k) => stats[k.id]?.bestellungen ?? 0,
    },
    {
      key: "volumen",
      label: "Volumen",
      sortable: true,
      align: "right",
      className: "font-mono-amount font-semibold text-foreground",
      render: (k) => formatBetrag(stats[k.id]?.volumen ?? 0),
    },
    {
      key: "keywords",
      label: "Keywords",
      hideBelow: "xl",
      render: (k) =>
        k.keywords.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {k.keywords.slice(0, 3).map((kw, i) => (
              <Badge key={i} tone="info" size="sm">
                {kw}
              </Badge>
            ))}
            {k.keywords.length > 3 && (
              <span className="text-[11px] text-foreground-subtle">
                +{k.keywords.length - 3}
              </span>
            )}
          </div>
        ) : (
          "–"
        ),
    },
    {
      key: "actions",
      label: "",
      stopPropagation: true,
      align: "right",
      width: 56,
      render: (k) =>
        istAdmin ? (
          <ActionMenu
            label={`Aktionen für ${k.name}`}
            items={[
              {
                label: "Bearbeiten",
                icon: <IconEdit />,
                onSelect: () => openEdit(k),
              },
              {
                label: "Löschen",
                icon: <IconTrash />,
                onSelect: () => setDeleteConfirm({ id: k.id, name: k.name }),
                destructive: true,
              },
            ]}
          />
        ) : null,
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
        <div>
          <h1 className="font-headline text-2xl text-foreground tracking-tight">Kunden</h1>
          <p className="text-foreground-subtle text-sm mt-1">
            {kunden.length} Auftraggeber{unbestaetigt.length > 0 ? ` · ${unbestaetigt.length} unbestätigt` : ""}
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

          <SavedViewsMenu<KundenViewConfig>
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
            disabled={bestaetigtSorted.length === 0}
            title="Kunden als CSV exportieren"
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
              Neuer Kunde
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && !showForm && (
        <div className="mb-4 flex items-center justify-between gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="text-red-400 hover:text-red-600 shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Unbestätigte Kunden (auto-erkannt) */}
      {unbestaetigt.length > 0 && (
        <div className="mb-6 card p-5 border-l-[3px] border-l-amber-400">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <h2 className="font-headline text-sm text-foreground">Auto-erkannte Kunden</h2>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">{unbestaetigt.length}</span>
          </div>
          <p className="text-xs text-foreground-subtle mb-3">Diese Kunden wurden automatisch aus Dokumenten erkannt. Bitte prüfen und bestätigen.</p>
          <div className="space-y-2">
            {unbestaetigt.map((k) => (
              <div key={k.id} className="flex items-center justify-between p-3 bg-amber-50/50 rounded-lg">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: k.farbe }} />
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-foreground">{k.name}</span>
                    {k.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {k.keywords.map((kw, i) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">{kw}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 ml-3 shrink-0">
                  <button
                    onClick={() => handleBestaetigen(k.id)}
                    disabled={confirmLoading === k.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 rounded-lg hover:bg-emerald-200 disabled:opacity-50 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    OK
                  </button>
                  <button
                    onClick={() => openEdit(k)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-foreground-subtle bg-line-subtle rounded-lg hover:bg-line transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Bearbeiten
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={resetForm}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-line">
              <div className="flex items-center justify-between">
                <h2 className="font-headline text-lg text-foreground tracking-tight">{editId ? "Kunde bearbeiten" : "Neuer Kunde"}</h2>
                <button onClick={resetForm} className="p-1 text-foreground-subtle hover:text-foreground transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase mb-1.5">Name *</label>
                  <input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-line rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand/30"
                    placeholder="z.B. Familie Müller"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase mb-1.5">Kürzel</label>
                  <input
                    value={formKuerzel}
                    onChange={(e) => setFormKuerzel(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-line rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand/30"
                    placeholder="z.B. MUE"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase mb-1.5">Adresse</label>
                <input
                  value={formAdresse}
                  onChange={(e) => setFormAdresse(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-line rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand/30"
                  placeholder="Straße Nr, PLZ Ort"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase mb-1.5">E-Mail</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-line rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand/30"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase mb-1.5">Telefon</label>
                  <input
                    type="tel"
                    value={formTelefon}
                    onChange={(e) => setFormTelefon(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-line rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase mb-1.5">Notizen</label>
                <textarea
                  value={formNotizen}
                  onChange={(e) => setFormNotizen(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-white border border-line rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand/30 resize-none"
                  placeholder="Interne Notizen..."
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase mb-1.5">Keywords (Enter zum Hinzufügen)</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {formKeywords.map((kw, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px] font-medium">
                      {kw}
                      <button type="button" onClick={() => setFormKeywords((prev) => prev.filter((_, j) => j !== i))} className="text-blue-400 hover:text-blue-700">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  value={formKeywordInput}
                  onChange={(e) => setFormKeywordInput(e.target.value)}
                  onKeyDown={handleKeywordAdd}
                  className="w-full px-3 py-2 bg-white border border-line rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand/30"
                  placeholder="Keyword eingeben + Enter"
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

              {error && <p className="text-red-600 text-sm">{error}</p>}
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
                {saving ? "Speichert..." : editId ? "Speichern" : "Anlegen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kunden-Grid */}
      {bestaetigt.length === 0 && unbestaetigt.length === 0 ? (
        <EmptyState
          tone="info"
          icon={<IconUsers className="w-5 h-5" />}
          title="Noch keine Kunden"
          description="Kunden werden automatisch aus Dokumenten erkannt oder können manuell angelegt werden."
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
                Ersten Kunden anlegen
              </Button>
            ) : undefined
          }
        />
      ) : viewMode === "table" ? (
        <DataTable<Kunde>
          columns={kundenColumns}
          data={bestaetigtSorted}
          getRowId={(k) => k.id}
          ariaLabel="Kunden-Liste"
          density={density}
          sort={sort}
          onSortChange={setSort}
          getSelectionAriaLabel={(k) => `Kunde ${k.name} auswählen`}
          emptyState={
            <EmptyState
              tone="info"
              compact
              icon={<IconUsers className="w-5 h-5" />}
              title="Keine Kunden in der Tabelle"
              description="Die bestätigten Kunden erscheinen hier."
            />
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bestaetigt.map((k) => {
            const s = stats[k.id] || { projekte: 0, bestellungen: 0, volumen: 0 };

            return (
              <div
                key={k.id}
                className="card card-hover relative overflow-hidden"
                style={{ borderLeft: `4px solid ${k.farbe}` }}
              >
                <div
                  className="absolute top-0 left-0 right-0 h-20 opacity-[0.04] pointer-events-none"
                  style={{ background: `linear-gradient(180deg, ${k.farbe}, transparent)` }}
                />

                <div className="p-5 relative">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-1">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-headline text-base text-foreground truncate">{k.name}</h3>
                      {k.kuerzel && (
                        <span className="text-[10px] text-foreground-faint font-mono">{k.kuerzel}</span>
                      )}
                    </div>
                    {istAdmin && (
                      <div className="flex items-center gap-0.5 ml-2 shrink-0">
                        <button
                          onClick={() => openEdit(k)}
                          className="p-1 rounded hover:bg-canvas transition-colors text-foreground-faint hover:text-brand"
                          title="Bearbeiten"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteConfirm({ id: k.id, name: k.name })}
                          className="p-1 rounded hover:bg-red-50 transition-colors text-foreground-faint hover:text-red-600"
                          title="Löschen"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Adresse + Kontakt */}
                  {k.adresse && (
                    <p className="text-xs text-foreground-muted truncate mt-1">{k.adresse}</p>
                  )}
                  {(k.email || k.telefon) && (
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-foreground-subtle">
                      {k.email && (
                        <span className="flex items-center gap-1 truncate" title={k.email}>
                          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                          </svg>
                          {k.email}
                        </span>
                      )}
                      {k.telefon && (
                        <span className="flex items-center gap-1" title={k.telefon}>
                          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                          </svg>
                          {k.telefon}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 mt-3 p-3 bg-input rounded-lg border border-line-subtle">
                    <div>
                      <p className="text-[10px] text-foreground-subtle uppercase tracking-wider font-semibold">Projekte</p>
                      <p className="font-mono-amount text-sm font-semibold text-foreground mt-0.5">{s.projekte}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-foreground-subtle uppercase tracking-wider font-semibold">Bestell.</p>
                      <p className="font-mono-amount text-sm font-semibold text-foreground mt-0.5">{s.bestellungen}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-foreground-subtle uppercase tracking-wider font-semibold">Volumen</p>
                      <p className="font-mono-amount text-sm font-semibold text-foreground mt-0.5">{formatBetrag(s.volumen)}</p>
                    </div>
                  </div>

                  {/* Keywords */}
                  {k.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {k.keywords.map((kw, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">{kw}</span>
                      ))}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="mt-4 pt-3 border-t border-line-subtle flex items-center justify-between">
                    <span className="text-[10px] text-foreground-faint">{formatDatum(k.created_at)}</span>
                    {k.notizen && (
                      <span className="text-[10px] text-foreground-subtle truncate max-w-[60%]" title={k.notizen}>
                        {k.notizen}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={handleDelete}
        title="Kunde löschen?"
        message={`„${deleteConfirm?.name}" wird gelöscht. Kunden mit zugeordneten Projekten oder Bestellungen können nicht gelöscht werden — zuerst die Zuordnungen entfernen.`}
        confirmLabel="Löschen"
        variant="danger"
      />
    </div>
  );
}
