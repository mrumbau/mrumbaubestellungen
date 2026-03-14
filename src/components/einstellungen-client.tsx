"use client";

import { useState } from "react";

interface Haendler {
  id: string;
  name: string;
  domain: string;
  url_muster: string[];
  email_absender: string[];
}

interface Benutzer {
  id: string;
  email: string;
  name: string;
  kuerzel: string;
  rolle: string;
}

export function EinstellungenClient({
  haendler: initialHaendler,
  benutzer,
}: {
  haendler: Haendler[];
  benutzer: Benutzer[];
}) {
  const [haendler, setHaendler] = useState(initialHaendler);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formular-State
  const [formName, setFormName] = useState("");
  const [formDomain, setFormDomain] = useState("");
  const [formUrlMuster, setFormUrlMuster] = useState("");
  const [formEmailAbsender, setFormEmailAbsender] = useState("");

  function resetForm() {
    setFormName("");
    setFormDomain("");
    setFormUrlMuster("");
    setFormEmailAbsender("");
    setEditId(null);
    setShowForm(false);
    setError(null);
  }

  function startEdit(h: Haendler) {
    setFormName(h.name);
    setFormDomain(h.domain);
    setFormUrlMuster(h.url_muster.join(", "));
    setFormEmailAbsender(h.email_absender.join(", "));
    setEditId(h.id);
    setShowForm(true);
    setError(null);
  }

  function startNew() {
    resetForm();
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || !formDomain.trim()) {
      setError("Name und Domain sind Pflichtfelder.");
      return;
    }

    setLoading(true);
    setError(null);

    const payload = {
      name: formName.trim(),
      domain: formDomain.trim(),
      url_muster: formUrlMuster
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      email_absender: formEmailAbsender
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };

    try {
      if (editId) {
        const res = await fetch(`/api/haendler/${editId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setHaendler((prev) =>
          prev.map((h) => (h.id === editId ? data.haendler : h))
        );
      } else {
        const res = await fetch("/api/haendler", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setHaendler((prev) => [...prev, data.haendler].sort((a, b) => a.name.localeCompare(b.name)));
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Händler "${name}" wirklich löschen?`)) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/haendler/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setHaendler((prev) => prev.filter((h) => h.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Löschen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Einstellungen</h1>
        <p className="text-slate-500 mt-1">Händler & Benutzerverwaltung</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Händlerliste */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">
              Händler ({haendler.length})
            </h2>
            <button
              onClick={startNew}
              className="px-3 py-1.5 text-sm bg-[#1E4D8C] text-white rounded-lg hover:bg-[#2E6BAD] transition-colors"
            >
              + Hinzufügen
            </button>
          </div>

          {/* Formular */}
          {showForm && (
            <form onSubmit={handleSubmit} className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="z.B. Bauhaus"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4D8C] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Domain *</label>
                <input
                  type="text"
                  value={formDomain}
                  onChange={(e) => setFormDomain(e.target.value)}
                  placeholder="z.B. bauhaus.de"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4D8C] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  URL-Muster <span className="font-normal text-slate-400">(kommagetrennt)</span>
                </label>
                <input
                  type="text"
                  value={formUrlMuster}
                  onChange={(e) => setFormUrlMuster(e.target.value)}
                  placeholder="/checkout/confirmation, /bestellbestaetigung"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4D8C] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  E-Mail-Absender <span className="font-normal text-slate-400">(kommagetrennt)</span>
                </label>
                <input
                  type="text"
                  value={formEmailAbsender}
                  onChange={(e) => setFormEmailAbsender(e.target.value)}
                  placeholder="bestellung@bauhaus.de, noreply@bauhaus.de"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1E4D8C] focus:border-transparent"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm bg-[#1E4D8C] text-white rounded-lg hover:bg-[#2E6BAD] transition-colors disabled:opacity-50"
                >
                  {loading ? "Speichern..." : editId ? "Aktualisieren" : "Anlegen"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-sm bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          )}

          {/* Händler-Liste */}
          {haendler.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">
              Noch keine Händler konfiguriert.
            </p>
          ) : (
            <div className="space-y-2">
              {haendler.map((h) => (
                <div
                  key={h.id}
                  className="flex items-start justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{h.name}</p>
                      <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                        {h.domain}
                      </span>
                    </div>
                    {h.url_muster.length > 0 && (
                      <p className="text-xs text-slate-400 mt-1 truncate">
                        URLs: {h.url_muster.join(", ")}
                      </p>
                    )}
                    {h.email_absender.length > 0 && (
                      <p className="text-xs text-slate-400 truncate">
                        E-Mails: {h.email_absender.join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <button
                      onClick={() => startEdit(h)}
                      className="p-1.5 text-slate-400 hover:text-[#1E4D8C] transition-colors"
                      title="Bearbeiten"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(h.id, h.name)}
                      className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                      title="Löschen"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Benutzerverwaltung */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4">
            Benutzer ({benutzer.length})
          </h2>
          <div className="space-y-2">
            {benutzer.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-3 rounded-lg border border-slate-100"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#1E4D8C] text-white flex items-center justify-center text-xs font-bold">
                    {user.kuerzel}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{user.name}</p>
                    <p className="text-xs text-slate-400">{user.email}</p>
                  </div>
                </div>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-semibold capitalize ${
                    user.rolle === "admin"
                      ? "bg-indigo-50 text-indigo-700"
                      : user.rolle === "buchhaltung"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-blue-50 text-blue-700"
                  }`}
                >
                  {user.rolle}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
