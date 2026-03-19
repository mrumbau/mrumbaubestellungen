"use client";

import { useState, useCallback } from "react";
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
  created_at: string;
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

const STATUS_LABELS: Record<string, { label: string; bg: string; text: string; border: string }> = {
  aktiv: { label: "Aktiv", bg: "bg-green-50", text: "text-green-700", border: "border-green-100" },
  abgeschlossen: { label: "Abgeschlossen", bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-200" },
  pausiert: { label: "Pausiert", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-100" },
  archiviert: { label: "Archiviert", bg: "bg-red-50", text: "text-red-600", border: "border-red-100" },
};

export function ProjekteClient({
  projekte: initialProjekte,
  stats,
  istAdmin,
}: {
  projekte: Projekt[];
  stats: Record<string, ProjektStats>;
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
  const [formStatus, setFormStatus] = useState("aktiv");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showArchiv, setShowArchiv] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const aktive = projekte.filter((p) => p.status !== "archiviert" && p.status !== "abgeschlossen");
  const archiviert = projekte.filter((p) => p.status === "archiviert" || p.status === "abgeschlossen");

  const resetForm = useCallback(() => {
    setShowForm(false);
    setEditId(null);
    setFormName("");
    setFormBeschreibung("");
    setFormFarbe("#570006");
    setFormBudget("");
    setFormStatus("aktiv");
    setError("");
  }, []);

  const openEdit = useCallback((p: Projekt) => {
    setEditId(p.id);
    setFormName(p.name);
    setFormBeschreibung(p.beschreibung || "");
    setFormFarbe(p.farbe);
    setFormBudget(p.budget?.toString() || "");
    setFormStatus(p.status);
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
        ...(editId ? { status: formStatus } : {}),
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

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/projekte/${deleteId}`, { method: "DELETE" });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.archiviert) {
          setProjekte((prev) => prev.map((p) => (p.id === deleteId ? { ...p, status: "archiviert" } : p)));
        } else {
          setProjekte((prev) => prev.filter((p) => p.id !== deleteId));
        }
        setDeleteId(null);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Projekt konnte nicht gelöscht werden");
        setDeleteId(null);
      }
    } catch {
      setError("Netzwerkfehler beim Löschen");
      setDeleteId(null);
    }
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

      {/* Form Modal */}
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

              {editId && (
                <div>
                  <label className="block text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase mb-1.5">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30"
                  >
                    <option value="aktiv">Aktiv</option>
                    <option value="pausiert">Pausiert</option>
                    <option value="abgeschlossen">Abgeschlossen</option>
                  </select>
                </div>
              )}

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
            const statusCfg = STATUS_LABELS[p.status] || STATUS_LABELS.aktiv;

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
                      <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                        {statusCfg.label}
                      </span>
                      {istAdmin && (
                        <div className="flex">
                          <button
                            onClick={() => openEdit(p)}
                            className="p-1 rounded hover:bg-[#f5f4f2] transition-colors text-[#c4c2bf] hover:text-[#570006]"
                            title="Bearbeiten"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setDeleteId(p.id)}
                            className="p-1 rounded hover:bg-red-50 transition-colors text-[#c4c2bf] hover:text-red-600"
                            title="Archivieren"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

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

      {/* Archiv Toggle */}
      {archiviert.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowArchiv(!showArchiv)}
            className="flex items-center gap-2 text-sm text-[#9a9a9a] hover:text-[#6b6b6b] transition-colors group"
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform duration-200 ${showArchiv ? "rotate-90" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
            <span className="font-medium">Archiviert</span>
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-[#e8e6e3] text-[#6b6b6b]">{archiviert.length}</span>
          </button>

          {showArchiv && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
              {archiviert.map((p) => {
                const s = stats[p.id] || { gesamt: 0, offen: 0, volumen: 0 };
                const statusCfg = STATUS_LABELS[p.status] || STATUS_LABELS.archiviert;
                return (
                  <div
                    key={p.id}
                    className="card p-4 border-l-4"
                    style={{ borderLeftColor: p.farbe }}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-headline text-sm text-[#6b6b6b] truncate">{p.name}</h3>
                      <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                        {statusCfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-[#9a9a9a]">
                      <span>{s.gesamt} Bestellungen</span>
                      <span className="h-3 w-px bg-[#e8e6e3]" />
                      <span className="font-mono-amount">{formatBetrag(s.volumen)}</span>
                    </div>
                    {istAdmin && (
                      <div className="mt-2 pt-2 border-t border-[#f0eeeb]">
                        <button
                          onClick={() => openEdit(p)}
                          className="text-[10px] text-[#9a9a9a] hover:text-[#570006] font-medium transition-colors"
                        >
                          Wiederherstellen
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Projekt archivieren?"
        message="Das Projekt wird archiviert. Bestehende Bestellungen behalten ihre Zuordnung."
        confirmLabel="Archivieren"
      />
    </div>
  );
}
