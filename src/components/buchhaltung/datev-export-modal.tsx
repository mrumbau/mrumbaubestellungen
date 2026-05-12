"use client";

/**
 * DatevExportModal — DATEV-Buchungsstapel-Export im EXTF-V700-Format.
 *
 * Aus buchhaltung-client.tsx extrahiert (12.05.2026, F4.7 Decomposition).
 * 12.05.2026 (DESIGN-Critique #8): Migriert auf shared <Modal> für
 * native-dialog-A11y (Focus-Trap, ESC, aria-labelledby, backdrop-click).
 *
 * Eigener State: Zeitraum, Datum-Basis, Projekt-Filter, erweiterte Optionen
 * (Berater-/Mandanten-Nr, Konten). Trigger: GET /api/export/datev?... → CSV-Blob.
 */

import { useState } from "react";
import { Modal } from "@/components/ui/modal";

export interface DatevExportProjekt {
  id: string;
  name: string;
}

export interface DatevExportModalProps {
  open: boolean;
  onClose: () => void;
  projekte: DatevExportProjekt[];
}

export function DatevExportModal({
  open,
  onClose,
  projekte,
}: DatevExportModalProps) {
  const [von, setVon] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [bis, setBis] = useState(() => new Date().toISOString().slice(0, 10));
  const [projekt, setProjekt] = useState("");
  const [beraterNr, setBeraterNr] = useState("231925");
  const [mandantenNr, setMandantenNr] = useState("30086");
  const [gegenKonto, setGegenKonto] = useState("4980");
  const [aufwandsKonto, setAufwandsKonto] = useState("");
  const [datumBasis, setDatumBasis] = useState<
    "freigabe" | "faelligkeit" | "bestellung"
  >("freigabe");
  const [showErweitert, setShowErweitert] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportieren() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ von, bis });
      if (projekt) params.set("projekt_id", projekt);
      if (beraterNr) params.set("berater_nr", beraterNr);
      if (mandantenNr) params.set("mandanten_nr", mandantenNr);
      if (gegenKonto) params.set("gegen_konto", gegenKonto);
      if (aufwandsKonto) params.set("aufwands_konto", aufwandsKonto);
      if (datumBasis !== "freigabe") params.set("datum_basis", datumBasis);

      const res = await fetch(`/api/export/datev?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Export fehlgeschlagen");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `EXTF_Buchungsstapel_${von}_${bis}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="DATEV Export"
      description="Buchungsstapel im DATEV-Format exportieren"
      size="md"
      dismissible={!loading}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            onClick={exportieren}
            disabled={loading || !von || !bis}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Exportiere..." : "DATEV Export starten"}
          </button>
        </>
      }
    >
      <div className="space-y-4 pt-2">
        {/* Zeitraum */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase mb-1.5">
              Von
            </label>
            <input
              type="date"
              value={von}
              onChange={(e) => setVon(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-foreground focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase mb-1.5">
              Bis
            </label>
            <input
              type="date"
              value={bis}
              onChange={(e) => setBis(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-foreground focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)]"
            />
          </div>
        </div>

        {/* Quick-Date Buttons */}
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "Akt. Monat", fn: () => { const n = new Date(); setVon(new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10)); setBis(n.toISOString().slice(0, 10)); } },
            { label: "Letzter Monat", fn: () => { const n = new Date(); const v = new Date(n.getFullYear(), n.getMonth() - 1, 1); const b = new Date(n.getFullYear(), n.getMonth(), 0); setVon(v.toISOString().slice(0, 10)); setBis(b.toISOString().slice(0, 10)); } },
            { label: "Letztes Quartal", fn: () => { const n = new Date(); const q = Math.floor(n.getMonth() / 3); const v = new Date(n.getFullYear(), (q - 1) * 3, 1); const b = new Date(n.getFullYear(), q * 3, 0); setVon(v.toISOString().slice(0, 10)); setBis(b.toISOString().slice(0, 10)); } },
            { label: "Letztes Jahr", fn: () => { const y = new Date().getFullYear() - 1; setVon(`${y}-01-01`); setBis(`${y}-12-31`); } },
          ].map((btn) => (
            <button
              key={btn.label}
              type="button"
              onClick={btn.fn}
              className="px-2.5 py-1 text-[12px] font-medium text-foreground-muted bg-canvas border border-line rounded-md hover:bg-input hover:text-foreground transition-colors"
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Datum-Basis */}
        <div>
          <label className="block text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase mb-1.5">
            Zeitraum bezieht sich auf
          </label>
          <select
            value={datumBasis}
            onChange={(e) => setDatumBasis(e.target.value as "freigabe" | "faelligkeit" | "bestellung")}
            className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-foreground focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)]"
          >
            <option value="freigabe">Freigabe-Datum (Standard)</option>
            <option value="faelligkeit">Fälligkeitsdatum (nur Bestellungen mit Fälligkeit)</option>
            <option value="bestellung">Bestelldatum (nur Bestellungen mit Bestelldatum)</option>
          </select>
          {datumBasis === "faelligkeit" && (
            <p className="text-[12px] text-foreground-subtle mt-1">
              Bestellungen ohne Fälligkeitsdatum werden ausgeschlossen.
            </p>
          )}
          {datumBasis === "bestellung" && (
            <p className="text-[12px] text-foreground-subtle mt-1">
              Bestellungen ohne Bestelldatum werden ausgeschlossen.
            </p>
          )}
        </div>

        {/* Projekt-Filter */}
        {projekte.length > 0 && (
          <div>
            <label className="block text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase mb-1.5">
              Projekt (optional)
            </label>
            <select
              value={projekt}
              onChange={(e) => setProjekt(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm text-foreground focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)]"
            >
              <option value="">Alle Projekte</option>
              {projekte.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* DATEV Info-Box */}
        <div className="p-3 bg-info-bg border border-info-border rounded-lg">
          <p className="text-[12px] text-info leading-relaxed">
            <span className="font-semibold">DATEV Format:</span> EXTF Version 700, Buchungsstapel. Kreditorenkonten werden automatisch pro Händler vergeben (70001+). Projekte werden als KOST1 exportiert.
          </p>
        </div>

        {/* Erweiterte Optionen (Collapsible) */}
        <div className="border border-line rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowErweitert(!showErweitert)}
            aria-expanded={showErweitert}
            className="w-full flex items-center justify-between px-3 py-2.5 text-[12px] font-semibold text-foreground-muted hover:bg-input transition-colors"
          >
            <span>Erweiterte Optionen</span>
            <svg
              className={`w-3.5 h-3.5 transition-transform ${showErweitert ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showErweitert && (
            <div className="px-3 pb-3 space-y-3 border-t border-line">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                <div>
                  <label className="block text-[12px] text-foreground-muted mb-1">
                    Berater-Nr.
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={beraterNr}
                    onChange={(e) => setBeraterNr(e.target.value.replace(/\D/g, "").slice(0, 7))}
                    maxLength={7}
                    placeholder="231925"
                    className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm font-mono-amount text-foreground focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] text-foreground-muted mb-1">
                    Mandanten-Nr.
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={mandantenNr}
                    onChange={(e) => setMandantenNr(e.target.value.replace(/\D/g, "").slice(0, 7))}
                    maxLength={7}
                    placeholder="30086"
                    className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm font-mono-amount text-foreground focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] text-foreground-muted mb-1">
                    Gegenkonto
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={gegenKonto}
                    onChange={(e) => setGegenKonto(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    maxLength={4}
                    placeholder="4980"
                    className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm font-mono-amount text-foreground focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] text-foreground-muted mb-1">
                    Aufwandskonto
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={aufwandsKonto}
                    onChange={(e) => setAufwandsKonto(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    maxLength={4}
                    placeholder="Optional"
                    className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm font-mono-amount text-foreground focus:outline-none focus:border-brand focus-visible:shadow-[var(--shadow-focus-ring)]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="p-3 bg-error-bg border border-error-border rounded-lg text-sm text-error" role="alert">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
