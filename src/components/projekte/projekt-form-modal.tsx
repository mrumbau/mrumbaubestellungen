"use client";

/**
 * ProjektFormModal — Create/Edit-Modal mit Farb-Picker + Kunde + Budget.
 * Aus projekte-client.tsx extrahiert (12.05.2026, F6.2 Sprint 2).
 */

import type { KundeOption } from "./types";

const FARBEN = [
  { hex: "#570006", label: "Rot" },
  { hex: "#2563eb", label: "Blau" },
  { hex: "#059669", label: "Grün" },
  { hex: "#d97706", label: "Amber" },
  { hex: "#7c3aed", label: "Violett" },
  { hex: "#0891b2", label: "Cyan" },
];

export interface ProjektFormModalProps {
  open: boolean;
  editMode: boolean; // true wenn ein Projekt editiert wird (sonst Create)
  formName: string;
  setFormName: (v: string) => void;
  formBeschreibung: string;
  setFormBeschreibung: (v: string) => void;
  formFarbe: string;
  setFormFarbe: (v: string) => void;
  formKundenId: string | null;
  setFormKundenId: (v: string | null) => void;
  formBudget: string;
  setFormBudget: (v: string) => void;
  kunden: KundeOption[];
  error: string | null;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export function ProjektFormModal({
  open,
  editMode,
  formName,
  setFormName,
  formBeschreibung,
  setFormBeschreibung,
  formFarbe,
  setFormFarbe,
  formKundenId,
  setFormKundenId,
  formBudget,
  setFormBudget,
  kunden,
  error,
  saving,
  onSave,
  onCancel,
}: ProjektFormModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-surface rounded-xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-line">
          <div className="flex items-center justify-between">
            <h2 className="font-headline text-lg text-foreground tracking-tight">
              {editMode ? "Projekt bearbeiten" : "Neues Projekt"}
            </h2>
            <button
              onClick={onCancel}
              className="p-1 text-foreground-subtle hover:text-foreground transition-colors"
              aria-label="Schließen"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase mb-1.5">
              Name *
            </label>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-foreground focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)]"
              placeholder="z.B. Umbau Müller Garage"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase mb-1.5">
              Beschreibung
            </label>
            <textarea
              value={formBeschreibung}
              onChange={(e) => setFormBeschreibung(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-foreground focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)] resize-none"
              placeholder="Optionale Beschreibung..."
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase mb-1.5">
              Farbe
            </label>
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
                    ...(formFarbe === f.hex
                      ? { ["--tw-ring-color" as string]: f.hex }
                      : {}),
                  }}
                  title={f.label}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase mb-1.5">
              Kunde
            </label>
            <select
              value={formKundenId || ""}
              onChange={(e) => setFormKundenId(e.target.value || null)}
              className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-foreground focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)]"
            >
              <option value="">Kein Kunde zugeordnet</option>
              {kunden.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase mb-1.5">
              Budget (EUR)
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={formBudget}
              onChange={(e) => setFormBudget(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-foreground font-mono-amount focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)]"
              placeholder="Optional"
              min="0"
              step="0.01"
            />
          </div>

          {error && <p className="text-error text-sm">{error}</p>}
        </div>

        <div className="p-6 border-t border-line flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="btn-primary px-4 py-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Speichert..." : editMode ? "Änderungen speichern" : "Projekt anlegen"}
          </button>
        </div>
      </div>
    </div>
  );
}
