"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatBetrag, formatDatum } from "@/lib/formatters";
import { ConfirmDialog } from "@/components/confirm-dialog";

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
  { value: "aktiv", label: "Aktiv", icon: "circle", color: "#059669", bg: "bg-green-50", text: "text-green-700", border: "border-green-100" },
  { value: "pausiert", label: "Pausiert", icon: "pause", color: "#d97706", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-100" },
  { value: "abgeschlossen", label: "Abgeschlossen", icon: "check", color: "#6b7280", bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-200" },
  { value: "archiviert", label: "Archivieren", icon: "archive", color: "#dc2626", bg: "bg-red-50", text: "text-red-600", border: "border-red-100" },
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
        <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-lg shadow-lg border border-[#e8e6e3] py-1 min-w-[160px]">
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
                    ? "bg-[#fafaf9] font-semibold text-[#1a1a1a]"
                    : opt.value === "archiviert"
                      ? "text-red-600 hover:bg-red-50"
                      : "text-[#6b6b6b] hover:bg-[#fafaf9]"
                }`}
              >
                <span style={{ color: opt.color }}>
                  <StatusIcon type={opt.icon} className="w-3.5 h-3.5" />
                </span>
                <span>{opt.value === "archiviert" ? "Archivieren" : opt.label}</span>
                {isActive && (
                  <svg className="w-3 h-3 ml-auto text-[#570006]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-headline text-2xl text-[#1a1a1a] tracking-tight">Projekte</h1>
          <p className="text-[#9a9a9a] text-sm mt-1">
            {aktive.length} aktiv{archiviert.length > 0 ? ` · ${archiviert.length} archiviert` : ""}
          </p>
        </div>
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

      {/* Error banner */}
      {error && !showForm && (
        <div className="mb-4 flex items-center justify-between gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} className="text-red-400 hover:text-red-600 shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Form Modal — no status field, status is managed via card dropdown */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={resetForm}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-[#e8e6e3]">
              <div className="flex items-center justify-between">
                <h2 className="font-headline text-lg text-[#1a1a1a] tracking-tight">{editId ? "Projekt bearbeiten" : "Neues Projekt"}</h2>
                <button onClick={resetForm} className="p-1 text-[#9a9a9a] hover:text-[#1a1a1a] transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase mb-1.5">Name *</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30"
                  placeholder="z.B. Umbau Müller Garage"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase mb-1.5">Beschreibung</label>
                <textarea
                  value={formBeschreibung}
                  onChange={(e) => setFormBeschreibung(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-white border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 resize-none"
                  placeholder="Optionale Beschreibung..."
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase mb-1.5">Farbe</label>
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
                <label className="block text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase mb-1.5">Kunde</label>
                <select
                  value={formKundenId || ""}
                  onChange={(e) => setFormKundenId(e.target.value || null)}
                  className="w-full px-3 py-2 bg-white border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30"
                >
                  <option value="">Kein Kunde zugeordnet</option>
                  {kunden.map((k) => (
                    <option key={k.id} value={k.id}>{k.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase mb-1.5">Budget (EUR)</label>
                <input
                  type="number"
                  value={formBudget}
                  onChange={(e) => setFormBudget(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] font-mono-amount focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30"
                  placeholder="Optional"
                  min="0"
                  step="0.01"
                />
              </div>

              {error && <p className="text-red-600 text-sm">{error}</p>}
            </div>

            <div className="p-6 border-t border-[#e8e6e3] flex justify-end gap-3">
              <button
                onClick={resetForm}
                className="px-4 py-2 text-sm font-medium text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary px-4 py-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Speichert..." : editId ? "Speichern" : "Erstellen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Projekt-Grid */}
      {aktive.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-[#fafaf9] border border-[#e8e6e3] flex items-center justify-center">
            <svg className="w-5 h-5 text-[#c4c2bf]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
            </svg>
          </div>
          <p className="text-[#6b6b6b] font-medium mb-1">Noch keine Projekte</p>
          {istAdmin && (
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="mt-3 text-[#570006] hover:text-[#7a1a1f] text-sm font-medium transition-colors"
            >
              Erstes Projekt erstellen
            </button>
          )}
        </div>
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
                      <h3 className="font-headline text-base text-[#1a1a1a] truncate">{p.name}</h3>
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
                            className="p-1 rounded hover:bg-[#f5f4f2] transition-colors text-[#c4c2bf] hover:text-[#570006]"
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
                    <p className="text-[11px] text-[#9a9a9a] mt-0.5 truncate">{p.kunde}</p>
                  )}

                  {/* Description */}
                  {p.beschreibung && (
                    <p className="text-xs text-[#6b6b6b] line-clamp-2 mb-3">{p.beschreibung}</p>
                  )}

                  {/* Stats — structured grid */}
                  <div className="grid grid-cols-3 gap-2 mt-3 p-3 bg-[#fafaf9] rounded-lg border border-[#f0eeeb]">
                    <div>
                      <p className="text-[10px] text-[#9a9a9a] uppercase tracking-wider font-semibold">Bestell.</p>
                      <p className="font-mono-amount text-sm font-semibold text-[#1a1a1a] mt-0.5">{s.gesamt}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#9a9a9a] uppercase tracking-wider font-semibold">Volumen</p>
                      <p className="font-mono-amount text-sm font-semibold text-[#1a1a1a] mt-0.5">{formatBetrag(s.volumen)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#9a9a9a] uppercase tracking-wider font-semibold">Offen</p>
                      <p className={`font-mono-amount text-sm font-semibold mt-0.5 ${s.offen > 0 ? "text-[#570006]" : "text-[#c4c2bf]"}`}>
                        {s.offen}
                      </p>
                    </div>
                  </div>

                  {/* Budget Bar */}
                  {budgetPercent !== null && p.budget && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className="text-[#9a9a9a] uppercase tracking-wider font-semibold">Budget</span>
                        <span className="font-mono-amount text-[#6b6b6b]">{formatBetrag(s.volumen)} / {formatBetrag(p.budget)}</span>
                      </div>
                      <div className="h-1.5 bg-[#e8e6e3] rounded-full overflow-hidden">
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
                  <div className="mt-4 pt-3 border-t border-[#f0eeeb] flex items-center justify-between">
                    <span className="text-[10px] text-[#c4c2bf]">{formatDatum(p.created_at)}</span>
                    <Link
                      href={`/bestellungen?projekt_id=${p.id}`}
                      className="inline-flex items-center gap-1 text-xs text-[#570006] hover:text-[#7a1a1f] font-medium transition-colors group/link"
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
            className="flex items-center gap-2 text-sm text-[#9a9a9a] hover:text-[#570006] transition-colors group"
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
