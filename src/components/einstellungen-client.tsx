"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";

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
  hatTestdaten: initialHatTestdaten,
}: {
  haendler: Haendler[];
  benutzer: Benutzer[];
  hatTestdaten: boolean;
}) {
  const [haendler, setHaendler] = useState(initialHaendler);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testdatenLoading, setTestdatenLoading] = useState(false);
  const [testdatenMsg, setTestdatenMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [hatTestdaten, setHatTestdaten] = useState(initialHatTestdaten);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [testdatenConfirm, setTestdatenConfirm] = useState<"create" | "delete" | null>(null);

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

  async function handleDelete(id: string) {
    setDeleteConfirm(null);
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

  async function handleTestdaten(action: "create" | "delete") {
    setTestdatenConfirm(null);
    setTestdatenLoading(true);
    setTestdatenMsg(null);
    try {
      const res = await fetch("/api/testdaten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTestdatenMsg({ type: "success", text: data.message });
      setHatTestdaten(action === "create");
    } catch (err) {
      setTestdatenMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Fehler",
      });
    } finally {
      setTestdatenLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Einstellungen</h1>
        <p className="text-slate-500 mt-1">Händler, Benutzer & Testdaten</p>
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
                      aria-label={`${h.name} bearbeiten`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm({ id: h.id, name: h.name })}
                      className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                      title="Löschen"
                      aria-label={`${h.name} löschen`}
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

      {/* Testdaten */}
      <div className="mt-6 bg-white rounded-xl border border-amber-200 p-6">
        <div className="flex items-center gap-3 mb-3">
          <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <h2 className="font-semibold text-slate-900">Testdaten</h2>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Testbestellungen anlegen um die Webapp zu testen. Testdaten sind an der Bestellnummer erkennbar (TEST-...) und können jederzeit vollständig entfernt werden.
        </p>

        {testdatenMsg && (
          <div
            className={`mb-4 p-3 rounded-lg text-sm font-medium ${
              testdatenMsg.type === "success"
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}
          >
            {testdatenMsg.text}
          </div>
        )}

        <div className="flex gap-3">
          {!hatTestdaten ? (
            <button
              type="button"
              onClick={() => setTestdatenConfirm("create")}
              disabled={testdatenLoading}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-[#1E4D8C] text-white rounded-lg hover:bg-[#2E6BAD] transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              {testdatenLoading ? "Wird angelegt..." : "Testdaten anlegen"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setTestdatenConfirm("delete")}
              disabled={testdatenLoading}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {testdatenLoading ? "Wird gelöscht..." : "Alle Testdaten löschen"}
            </button>
          )}
        </div>
      </div>

      {/* Confirm Dialogs */}
      <ConfirmDialog
        open={!!deleteConfirm}
        title="Händler löschen"
        message={`Soll der Händler "${deleteConfirm?.name}" wirklich gelöscht werden?`}
        confirmLabel="Löschen"
        variant="danger"
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
      />
      <ConfirmDialog
        open={testdatenConfirm === "create"}
        title="Testdaten anlegen"
        message="8 Testbestellungen mit Dokumenten, Abgleichen und Kommentaren anlegen?"
        confirmLabel="Anlegen"
        onConfirm={() => handleTestdaten("create")}
        onCancel={() => setTestdatenConfirm(null)}
      />
      <ConfirmDialog
        open={testdatenConfirm === "delete"}
        title="Testdaten löschen"
        message="Alle Testdaten unwiderruflich löschen?"
        confirmLabel="Löschen"
        variant="danger"
        onConfirm={() => handleTestdaten("delete")}
        onCancel={() => setTestdatenConfirm(null)}
      />
    </div>
  );
}
