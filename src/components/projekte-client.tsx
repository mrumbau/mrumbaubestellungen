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

const STATUS_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  aktiv: { label: "Aktiv", bg: "bg-green-50", text: "text-green-700" },
  abgeschlossen: { label: "Abgeschlossen", bg: "bg-gray-100", text: "text-gray-600" },
  pausiert: { label: "Pausiert", bg: "bg-amber-50", text: "text-amber-700" },
  archiviert: { label: "Archiviert", bg: "bg-red-50", text: "text-red-600" },
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
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-headline text-2xl text-[#1a1a1a] tracking-tight">Projekte</h1>
          <p className="text-[#9a9a9a] text-sm mt-1">
            {aktive.length} aktiv{archiviert.length > 0 ? `, ${archiviert.length} archiviert` : ""}
          </p>
        </div>
        {istAdmin && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="btn-primary px-4 py-2 rounded-lg text-sm flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Neues Projekt
          </button>
        )}
      </div>

      <div className="industrial-line my-4" />

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
          <div className="card p-6 w-full max-w-lg">
            <h2 className="font-headline text-lg mb-4">{editId ? "Projekt bearbeiten" : "Neues Projekt"}</h2>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#6b6b6b] uppercase tracking-wider">Name *</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-[#e8e6e3] rounded-lg text-sm focus:outline-none focus:border-[#570006] bg-[#fafaf9]"
                  placeholder="z.B. Umbau Müller Garage"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#6b6b6b] uppercase tracking-wider">Beschreibung</label>
                <textarea
                  value={formBeschreibung}
                  onChange={(e) => setFormBeschreibung(e.target.value)}
                  rows={2}
                  className="mt-1 w-full px-3 py-2 border border-[#e8e6e3] rounded-lg text-sm focus:outline-none focus:border-[#570006] bg-[#fafaf9] resize-none"
                  placeholder="Optionale Beschreibung..."
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#6b6b6b] uppercase tracking-wider">Farbe</label>
                <div className="flex gap-2 mt-1">
                  {FARBEN.map((f) => (
                    <button
                      key={f.hex}
                      onClick={() => setFormFarbe(f.hex)}
                      className="w-8 h-8 rounded-lg transition-all"
                      style={{
                        background: f.hex,
                        outline: formFarbe === f.hex ? `3px solid ${f.hex}` : "none",
                        outlineOffset: "2px",
                      }}
                      title={f.label}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#6b6b6b] uppercase tracking-wider">Budget (EUR)</label>
                <input
                  type="number"
                  value={formBudget}
                  onChange={(e) => setFormBudget(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-[#e8e6e3] rounded-lg text-sm focus:outline-none focus:border-[#570006] bg-[#fafaf9]"
                  placeholder="Optional"
                  min="0"
                  step="0.01"
                />
              </div>

              {editId && (
                <div>
                  <label className="text-xs font-semibold text-[#6b6b6b] uppercase tracking-wider">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-[#e8e6e3] rounded-lg text-sm focus:outline-none focus:border-[#570006] bg-[#fafaf9]"
                  >
                    <option value="aktiv">Aktiv</option>
                    <option value="pausiert">Pausiert</option>
                    <option value="abgeschlossen">Abgeschlossen</option>
                  </select>
                </div>
              )}

              {error && <p className="text-red-600 text-sm">{error}</p>}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={resetForm}
                className="px-4 py-2 text-sm text-[#6b6b6b] hover:text-[#1a1a1a] transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary px-4 py-2 rounded-lg text-sm"
              >
                {saving ? "Speichert..." : editId ? "Speichern" : "Erstellen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Projekt-Grid */}
      {aktive.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-[#9a9a9a]">Noch keine Projekte angelegt.</p>
          {istAdmin && (
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="mt-4 text-[#570006] hover:text-[#7a1a1f] text-sm font-medium transition-colors"
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
                className="card card-hover p-5 relative overflow-hidden"
                style={{ borderLeft: `4px solid ${p.farbe}` }}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-headline text-base text-[#1a1a1a] truncate">{p.name}</h3>
                    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${statusCfg.bg} ${statusCfg.text} mt-1`}>
                      {statusCfg.label}
                    </span>
                  </div>
                  {istAdmin && (
                    <div className="flex gap-1 ml-2">
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 rounded hover:bg-[#f5f4f2] transition-colors text-[#9a9a9a] hover:text-[#570006]"
                        title="Bearbeiten"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteId(p.id)}
                        className="p-1.5 rounded hover:bg-red-50 transition-colors text-[#9a9a9a] hover:text-red-600"
                        title="Archivieren"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* Beschreibung */}
                {p.beschreibung && (
                  <p className="text-[#6b6b6b] text-xs mt-1 line-clamp-2">{p.beschreibung}</p>
                )}

                {/* Stats */}
                <div className="flex items-center gap-4 mt-4 text-xs">
                  <div>
                    <span className="text-[#9a9a9a]">Bestellungen</span>
                    <span className="ml-1 font-semibold text-[#1a1a1a]">{s.gesamt}</span>
                  </div>
                  <div>
                    <span className="text-[#9a9a9a]">Volumen</span>
                    <span className="ml-1 font-mono-amount font-semibold text-[#1a1a1a]">{formatBetrag(s.volumen)}</span>
                  </div>
                  {s.offen > 0 && (
                    <div>
                      <span className="text-[#9a9a9a]">Offen</span>
                      <span className="ml-1 font-semibold text-red-600">{s.offen}</span>
                    </div>
                  )}
                </div>

                {/* Budget Bar */}
                {budgetPercent !== null && p.budget && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] text-[#9a9a9a] mb-1">
                      <span>Budget</span>
                      <span className="font-mono-amount">{formatBetrag(s.volumen)} / {formatBetrag(p.budget)}</span>
                    </div>
                    <div className="h-1 bg-[#f0eeeb] rounded-full overflow-hidden">
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

                {/* Link */}
                <div className="mt-4 pt-3 border-t border-[#f0eeeb]">
                  <Link
                    href={`/bestellungen?projekt_id=${p.id}`}
                    className="text-xs text-[#570006] hover:text-[#7a1a1f] font-medium transition-colors"
                  >
                    Bestellungen anzeigen →
                  </Link>
                </div>

                {/* Erstelldatum */}
                <p className="text-[10px] text-[#c4c2bf] mt-2">Erstellt: {formatDatum(p.created_at)}</p>
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
            className="flex items-center gap-2 text-sm text-[#9a9a9a] hover:text-[#6b6b6b] transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform ${showArchiv ? "rotate-90" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Archiv ({archiviert.length})
          </button>

          {showArchiv && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4 opacity-60">
              {archiviert.map((p) => {
                const s = stats[p.id] || { gesamt: 0, offen: 0, volumen: 0 };
                const statusCfg = STATUS_LABELS[p.status] || STATUS_LABELS.archiviert;
                return (
                  <div key={p.id} className="card p-5" style={{ borderLeft: `4px solid ${p.farbe}` }}>
                    <div className="flex items-center justify-between">
                      <h3 className="font-headline text-sm text-[#6b6b6b] truncate">{p.name}</h3>
                      <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${statusCfg.bg} ${statusCfg.text}`}>
                        {statusCfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-[#9a9a9a]">
                      <span>{s.gesamt} Bestellungen</span>
                      <span className="font-mono-amount">{formatBetrag(s.volumen)}</span>
                    </div>
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
