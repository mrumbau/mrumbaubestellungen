"use client";

import { useState, useEffect, useCallback } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { createBrowserSupabaseClient } from "@/lib/supabase";

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

interface HaendlerStat {
  gesamt: number;
  letzte: string | null;
  abweichungen: number;
}

interface WebhookLog {
  id: string;
  typ: string;
  status: string;
  bestellnummer: string | null;
  fehler_text: string | null;
  created_at: string;
}

interface Projekt {
  id: string;
  name: string;
  farbe: string;
  budget: number | null;
  status: string;
  beschreibung: string | null;
  kunde: string | null;
}

interface HealthStatus {
  status: string;
  timestamp: string;
  supabase: string;
  openai: string;
  make_webhook: string;
}

export function EinstellungenClient({
  haendler: initialHaendler,
  benutzer,
  hatTestdaten: initialHatTestdaten,
  haendlerStats,
  extensionSignale,
  webhookLogs: initialWebhookLogs,
  projekte: initialProjekte = [],
}: {
  haendler: Haendler[];
  benutzer: Benutzer[];
  hatTestdaten: boolean;
  haendlerStats: Record<string, HaendlerStat>;
  extensionSignale: Record<string, string>;
  webhookLogs: WebhookLog[];
  projekte?: Projekt[];
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

  const [formName, setFormName] = useState("");
  const [formDomain, setFormDomain] = useState("");
  const [formUrlMuster, setFormUrlMuster] = useState("");
  const [formEmailAbsender, setFormEmailAbsender] = useState("");

  // System-Status
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  // Webhook-Logs
  const [webhookLogs, setWebhookLogs] = useState(initialWebhookLogs);
  const [logFilter, setLogFilter] = useState<"alle" | "error">("alle");

  // Projekte
  const [projekteListe, setProjekteListe] = useState(initialProjekte);
  const [projektEditId, setProjektEditId] = useState<string | null>(null);
  const [showProjektForm, setShowProjektForm] = useState(false);
  const [projektLoading, setProjektLoading] = useState(false);
  const [projektFormName, setProjektFormName] = useState("");
  const [projektFormBeschreibung, setProjektFormBeschreibung] = useState("");
  const [projektFormFarbe, setProjektFormFarbe] = useState("#570006");
  const [projektFormBudget, setProjektFormBudget] = useState("");
  const [projektFormKunde, setProjektFormKunde] = useState("");
  const [projektFormStatus, setProjektFormStatus] = useState("aktiv");
  const [archivProjektConfirm, setArchivProjektConfirm] = useState<{ id: string; name: string } | null>(null);

  const PROJEKT_FARBEN = ["#570006", "#2563eb", "#059669", "#d97706", "#7c3aed", "#0891b2"];

  // Passwort ändern
  const [pwAktuell, setPwAktuell] = useState("");
  const [pwNeu, setPwNeu] = useState("");
  const [pwBestaetigung, setPwBestaetigung] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth({ status: "error", timestamp: new Date().toISOString(), supabase: "error", openai: "error", make_webhook: "error" });
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

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

  async function handlePasswortAendern(e: React.FormEvent) {
    e.preventDefault();
    if (!pwNeu || !pwBestaetigung) {
      setPwMsg({ type: "error", text: "Bitte alle Felder ausfüllen." });
      return;
    }
    if (pwNeu !== pwBestaetigung) {
      setPwMsg({ type: "error", text: "Passwörter stimmen nicht überein." });
      return;
    }
    if (pwNeu.length < 8) {
      setPwMsg({ type: "error", text: "Mindestens 8 Zeichen erforderlich." });
      return;
    }

    setPwLoading(true);
    setPwMsg(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password: pwNeu });
      if (error) throw new Error(error.message);
      setPwMsg({ type: "success", text: "Passwort erfolgreich geändert." });
      setPwAktuell("");
      setPwNeu("");
      setPwBestaetigung("");
    } catch (err) {
      setPwMsg({ type: "error", text: err instanceof Error ? err.message : "Fehler beim Ändern" });
    } finally {
      setPwLoading(false);
    }
  }

  // Projekt-Funktionen
  function resetProjektForm() {
    setProjektFormName("");
    setProjektFormBeschreibung("");
    setProjektFormFarbe("#570006");
    setProjektFormBudget("");
    setProjektFormKunde("");
    setProjektFormStatus("aktiv");
    setProjektEditId(null);
    setShowProjektForm(false);
  }

  function startProjektEdit(p: Projekt) {
    setProjektFormName(p.name);
    setProjektFormBeschreibung(p.beschreibung || "");
    setProjektFormFarbe(p.farbe);
    setProjektFormBudget(p.budget ? String(p.budget) : "");
    setProjektFormKunde(p.kunde || "");
    setProjektFormStatus(p.status);
    setProjektEditId(p.id);
    setShowProjektForm(true);
  }

  async function handleProjektSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projektFormName.trim()) return;
    setProjektLoading(true);
    try {
      const payload = {
        name: projektFormName.trim(),
        beschreibung: projektFormBeschreibung.trim() || null,
        kunde: projektFormKunde.trim() || null,
        farbe: projektFormFarbe,
        budget: projektFormBudget ? Number(projektFormBudget) : null,
        status: projektFormStatus,
      };
      if (projektEditId) {
        const res = await fetch(`/api/projekte/${projektEditId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setProjekteListe((prev) => prev.map((p) => (p.id === projektEditId ? data.projekt : p)));
      } else {
        const res = await fetch("/api/projekte", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setProjekteListe((prev) => [...prev, data.projekt].sort((a, b) => a.name.localeCompare(b.name)));
      }
      resetProjektForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setProjektLoading(false);
    }
  }

  async function handleProjektArchiv(id: string) {
    setArchivProjektConfirm(null);
    setProjektLoading(true);
    try {
      const res = await fetch(`/api/projekte/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.geloescht) {
        setProjekteListe((prev) => prev.filter((p) => p.id !== id));
      } else {
        setProjekteListe((prev) => prev.map((p) => (p.id === id ? { ...p, status: "archiviert" } : p)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Archivieren");
    } finally {
      setProjektLoading(false);
    }
  }

  const aktiveProjekte = projekteListe.filter((p) => ["aktiv", "pausiert"].includes(p.status));
  const inaktiveProjekte = projekteListe.filter((p) => ["abgeschlossen", "archiviert"].includes(p.status));

  // Webhook-Logs refresh
  async function refreshWebhookLogs() {
    try {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase
        .from("webhook_logs")
        .select("id, typ, status, bestellnummer, fehler_text, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setWebhookLogs(data);
    } catch { /* stille Fehlerbehandlung */ }
  }

  const filteredLogs = logFilter === "error"
    ? webhookLogs.filter((l) => l.status === "error")
    : webhookLogs;

  // Hilfsfunktionen
  function formatZeit(iso: string) {
    return new Date(iso).toLocaleString("de-DE", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function getExtensionStatus(kuerzel: string): { label: string; color: string; dotClass: string } {
    const letztes = extensionSignale[kuerzel];
    if (!letztes) return { label: "Noch kein Signal", color: "text-red-600", dotClass: "bg-red-500 animate-pulse" };
    const tage = Math.floor((Date.now() - new Date(letztes).getTime()) / (1000 * 60 * 60 * 24));
    if (tage < 7) return { label: `Aktiv vor ${tage === 0 ? "heute" : `${tage} Tag${tage > 1 ? "en" : ""}`}`, color: "text-green-600", dotClass: "bg-green-500" };
    if (tage <= 30) return { label: `Vor ${tage} Tagen`, color: "text-amber-600", dotClass: "bg-amber-500" };
    return { label: `Vor ${tage} Tagen`, color: "text-red-600", dotClass: "bg-red-500 animate-pulse" };
  }

  const besteller = benutzer.filter((b) => b.rolle === "besteller");

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-headline text-2xl text-[#1a1a1a] tracking-tight">Einstellungen</h1>
        <p className="text-[#9a9a9a] text-sm mt-1">System, Händler, Benutzer & Testdaten</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ═══════════════════════════════════════════
          1. SYSTEM-STATUS WIDGET
          ═══════════════════════════════════════════ */}
      <div className={`card p-5 mb-6 ${health && health.status !== "ok" ? "border-l-4 border-l-amber-400" : ""}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#570006]/5 flex items-center justify-center">
              <svg className="w-4 h-4 text-[#570006]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
            <h2 className="font-headline text-sm text-[#1a1a1a] tracking-tight">System-Status</h2>
          </div>
          <button
            onClick={fetchHealth}
            disabled={healthLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-[#570006] bg-[#570006]/5 rounded-lg hover:bg-[#570006]/10 transition-colors disabled:opacity-50"
          >
            {healthLoading ? (
              <span className="w-3 h-3 spinner" />
            ) : (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            Prüfen
          </button>
        </div>

        {health ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatusDot label="Supabase" status={health.supabase === "ok" ? "online" : "offline"} />
            <StatusDot label="OpenAI API" status={health.openai === "ok" ? "online" : "offline"} />
            <StatusDot label="Make.com Webhook" status={health.make_webhook === "configured" ? "configured" : "offline"} />
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#fafaf9]">
              <svg className="w-3.5 h-3.5 text-[#c4c2bf]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-[10px] text-[#c4c2bf] uppercase tracking-wider">Letzter Check</p>
                <p className="text-[11px] font-medium text-[#6b6b6b]">{formatZeit(health.timestamp)}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-4">
            <span className="w-5 h-5 spinner" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ═══════════════════════════════════════════
            HÄNDLERLISTE + STATISTIKEN
            ═══════════════════════════════════════════ */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-headline text-sm text-[#1a1a1a] tracking-tight">
              Händler ({haendler.length})
            </h2>
            <button
              onClick={startNew}
              className="px-3 py-1.5 text-sm font-medium bg-[#570006] text-white rounded-lg hover:bg-[#7a1a1f] transition-colors"
            >
              + Hinzufügen
            </button>
          </div>

          {/* Formular */}
          {showForm && (
            <form onSubmit={handleSubmit} className="mb-4 p-4 bg-[#fafaf9] rounded-lg border border-[#e8e6e3] space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase mb-1">Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="z.B. Bauhaus"
                  className="w-full px-3 py-2 border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] bg-white focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase mb-1">Domain *</label>
                <input
                  type="text"
                  value={formDomain}
                  onChange={(e) => setFormDomain(e.target.value)}
                  placeholder="z.B. bauhaus.de"
                  className="w-full px-3 py-2 border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] bg-white focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase mb-1">
                  URL-Muster <span className="font-normal text-[#c4c2bf] normal-case tracking-normal">(kommagetrennt)</span>
                </label>
                <input
                  type="text"
                  value={formUrlMuster}
                  onChange={(e) => setFormUrlMuster(e.target.value)}
                  placeholder="/checkout/confirmation, /bestellbestaetigung"
                  className="w-full px-3 py-2 border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] bg-white focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase mb-1">
                  E-Mail-Absender <span className="font-normal text-[#c4c2bf] normal-case tracking-normal">(kommagetrennt)</span>
                </label>
                <input
                  type="text"
                  value={formEmailAbsender}
                  onChange={(e) => setFormEmailAbsender(e.target.value)}
                  placeholder="bestellung@bauhaus.de, noreply@bauhaus.de"
                  className="w-full px-3 py-2 border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] bg-white focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium bg-[#570006] text-white rounded-lg hover:bg-[#7a1a1f] transition-colors disabled:opacity-50"
                >
                  {loading ? "Speichern..." : editId ? "Aktualisieren" : "Anlegen"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 text-sm font-medium bg-[#f5f4f2] text-[#6b6b6b] border border-[#e8e6e3] rounded-lg hover:bg-[#ebe9e6] transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          )}

          {/* Händler-Liste mit Stats */}
          {haendler.length === 0 ? (
            <p className="text-sm text-[#c4c2bf] py-4 text-center">
              Noch keine Händler konfiguriert.
            </p>
          ) : (
            <div className="space-y-2">
              {haendler.map((h) => {
                const stat = haendlerStats[h.name];
                return (
                  <div
                    key={h.id}
                    className="flex items-start justify-between p-3 rounded-lg border border-[#f0eeeb] hover:bg-[#fafaf9] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-[#1a1a1a]">{h.name}</p>
                        <span className="text-[10px] px-2 py-0.5 bg-[#f5f4f2] text-[#9a9a9a] rounded font-mono-amount">
                          {h.domain}
                        </span>
                      </div>
                      {h.url_muster.length > 0 && (
                        <p className="text-[11px] text-[#c4c2bf] mt-1 truncate">
                          URLs: {h.url_muster.join(", ")}
                        </p>
                      )}
                      {h.email_absender.length > 0 && (
                        <p className="text-[11px] text-[#c4c2bf] truncate">
                          E-Mails: {h.email_absender.join(", ")}
                        </p>
                      )}
                      {/* Händler-Statistiken */}
                      {stat && (
                        <div className="flex items-center gap-3 mt-2">
                          <span className="inline-flex items-center gap-1 text-[10px] text-[#6b6b6b]">
                            <span className="font-mono-amount font-bold text-[#1a1a1a]">{stat.gesamt}</span> Bestellungen
                          </span>
                          {stat.letzte && (
                            <span className="text-[10px] text-[#c4c2bf]">
                              Letzte: {new Date(stat.letzte).toLocaleDateString("de-DE")}
                            </span>
                          )}
                          {stat.gesamt > 0 && (
                            <span className={`text-[10px] font-medium ${stat.abweichungen > 0 ? "text-red-600" : "text-green-600"}`}>
                              {stat.abweichungen > 0
                                ? `${Math.round((stat.abweichungen / stat.gesamt) * 100)}% Abw.`
                                : "0% Abw."}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <button
                        onClick={() => startEdit(h)}
                        className="p-1.5 text-[#c4c2bf] hover:text-[#570006] transition-colors"
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
                        className="p-1.5 text-[#c4c2bf] hover:text-red-600 transition-colors"
                        title="Löschen"
                        aria-label={`${h.name} löschen`}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════
            BENUTZERVERWALTUNG
            ═══════════════════════════════════════════ */}
        <div className="card p-6">
          <h2 className="font-headline text-sm text-[#1a1a1a] tracking-tight mb-4">
            Benutzer ({benutzer.length})
          </h2>
          <div className="space-y-2">
            {benutzer.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-3 rounded-lg border border-[#f0eeeb]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#570006] text-white flex items-center justify-center text-[11px] font-bold">
                    {user.kuerzel}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#1a1a1a]">{user.name}</p>
                    <p className="text-[11px] text-[#c4c2bf]">{user.email}</p>
                  </div>
                </div>
                <span
                  className={`status-tag ${
                    user.rolle === "admin"
                      ? "bg-[#570006]/5 text-[#570006]"
                      : user.rolle === "buchhaltung"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-blue-50 text-blue-700"
                  }`}
                >
                  <span className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-sm ${
                    user.rolle === "admin"
                      ? "bg-[#570006]"
                      : user.rolle === "buchhaltung"
                      ? "bg-emerald-600"
                      : "bg-blue-600"
                  }`} />
                  {user.rolle}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          PROJEKT-VERWALTUNG
          ═══════════════════════════════════════════ */}
      <div className="mt-6 card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#7c3aed]/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-[#7c3aed]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h2 className="font-headline text-sm text-[#1a1a1a] tracking-tight">Projekte / Baustellen ({aktiveProjekte.length})</h2>
          </div>
          <button
            onClick={() => { resetProjektForm(); setShowProjektForm(true); }}
            className="px-3 py-1.5 text-sm font-medium bg-[#570006] text-white rounded-lg hover:bg-[#7a1a1f] transition-colors"
          >
            + Neues Projekt
          </button>
        </div>

        {showProjektForm && (
          <form onSubmit={handleProjektSubmit} className="mb-4 p-4 bg-[#fafaf9] rounded-lg border border-[#e8e6e3] space-y-3">
            <div>
              <label className="block text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase mb-1">Name *</label>
              <input type="text" value={projektFormName} onChange={(e) => setProjektFormName(e.target.value)}
                placeholder="z.B. Sanierung Hauptstraße 12"
                className="w-full px-3 py-2 border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] bg-white focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase mb-1">Beschreibung</label>
                <input type="text" value={projektFormBeschreibung} onChange={(e) => setProjektFormBeschreibung(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2 border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] bg-white focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase mb-1">Kunde</label>
                <input type="text" value={projektFormKunde} onChange={(e) => setProjektFormKunde(e.target.value)}
                  placeholder="z.B. Müller GmbH"
                  className="w-full px-3 py-2 border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] bg-white focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase mb-1">Farbe</label>
                <div className="flex gap-2">
                  {PROJEKT_FARBEN.map((f) => (
                    <button key={f} type="button" onClick={() => setProjektFormFarbe(f)}
                      className={`w-7 h-7 rounded-lg transition-all ${projektFormFarbe === f ? "ring-2 ring-offset-2 ring-[#570006] scale-110" : "hover:scale-105"}`}
                      style={{ background: f }} />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase mb-1">Budget (€)</label>
                <input type="number" value={projektFormBudget} onChange={(e) => setProjektFormBudget(e.target.value)}
                  placeholder="Optional" min="0" step="0.01"
                  className="w-full px-3 py-2 border border-[#e8e6e3] rounded-lg text-sm font-mono-amount text-[#1a1a1a] bg-white focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors" />
              </div>
            </div>
            {projektEditId && (
              <div>
                <label className="block text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase mb-1">Status</label>
                <select value={projektFormStatus} onChange={(e) => setProjektFormStatus(e.target.value)}
                  className="px-3 py-2 border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] bg-white focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30">
                  <option value="aktiv">Aktiv</option>
                  <option value="pausiert">Pausiert</option>
                  <option value="abgeschlossen">Abgeschlossen</option>
                </select>
              </div>
            )}
            <div className="flex gap-2">
              <button type="submit" disabled={projektLoading}
                className="px-4 py-2 text-sm font-medium bg-[#570006] text-white rounded-lg hover:bg-[#7a1a1f] transition-colors disabled:opacity-50">
                {projektLoading ? "Speichern..." : projektEditId ? "Aktualisieren" : "Anlegen"}
              </button>
              <button type="button" onClick={resetProjektForm}
                className="px-4 py-2 text-sm font-medium bg-[#f5f4f2] text-[#6b6b6b] border border-[#e8e6e3] rounded-lg hover:bg-[#ebe9e6] transition-colors">
                Abbrechen
              </button>
            </div>
          </form>
        )}

        {aktiveProjekte.length === 0 ? (
          <p className="text-sm text-[#c4c2bf] py-4 text-center">Noch keine Projekte angelegt.</p>
        ) : (
          <div className="space-y-2">
            {aktiveProjekte.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-[#f0eeeb] hover:bg-[#fafaf9] transition-colors">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.farbe }} />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[#1a1a1a]">{p.name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        p.status === "aktiv" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                      }`}>{p.status === "aktiv" ? "Aktiv" : "Pausiert"}</span>
                    </div>
                    {p.beschreibung && <p className="text-[11px] text-[#c4c2bf] mt-0.5">{p.beschreibung}</p>}
                    {p.budget && (
                      <p className="text-[11px] text-[#9a9a9a] font-mono-amount mt-0.5">
                        Budget: {Number(p.budget).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  <button onClick={() => startProjektEdit(p)} className="p-1.5 text-[#c4c2bf] hover:text-[#570006] transition-colors" title="Bearbeiten">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button onClick={() => setArchivProjektConfirm({ id: p.id, name: p.name })} className="p-1.5 text-[#c4c2bf] hover:text-red-600 transition-colors" title="Archivieren">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {inaktiveProjekte.length > 0 && (
          <details className="mt-4">
            <summary className="text-[11px] font-medium text-[#9a9a9a] cursor-pointer hover:text-[#570006] transition-colors">
              {inaktiveProjekte.length} abgeschlossene/archivierte Projekte
            </summary>
            <div className="mt-2 space-y-1">
              {inaktiveProjekte.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg opacity-60">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.farbe }} />
                  <span className="text-sm text-[#9a9a9a]">{p.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f5f4f2] text-[#c4c2bf]">{p.status}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* ═══════════════════════════════════════════
          3. CHROME EXTENSION STATUS
          ═══════════════════════════════════════════ */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 14v6m-3-3h6M6 10h2a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2zm10 0h2a2 2 0 002-2V6a2 2 0 00-2-2h-2a2 2 0 00-2 2v2a2 2 0 002 2zM6 20h2a2 2 0 002-2v-2a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="font-headline text-sm text-[#1a1a1a] tracking-tight">Chrome Extension</h2>
              <p className="text-[10px] text-[#c4c2bf] mt-0.5">Signale pro Besteller</p>
            </div>
          </div>

          {besteller.length === 0 ? (
            <p className="text-sm text-[#c4c2bf] py-4 text-center">Keine Besteller vorhanden.</p>
          ) : (
            <div className="space-y-2">
              {besteller.map((b) => {
                const ext = getExtensionStatus(b.kuerzel);
                return (
                  <div key={b.id} className="flex items-center justify-between p-3 rounded-lg border border-[#f0eeeb]">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold">
                        {b.kuerzel}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#1a1a1a]">{b.name}</p>
                        <p className={`text-[11px] ${ext.color}`}>{ext.label}</p>
                      </div>
                    </div>
                    <span className={`w-2.5 h-2.5 rounded-full ${ext.dotClass}`} />
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 p-3 bg-[#fafaf9] rounded-lg border border-[#f0eeeb]">
            <p className="text-[11px] text-[#9a9a9a]">
              Die Chrome Extension sendet bei jeder Bestellung ein Signal. Installieren unter: <span className="font-medium text-[#570006]">chrome://extensions</span> (Entwicklermodus)
            </p>
          </div>
        </div>

        {/* ═══════════════════════════════════════════
            5. PASSWORT ÄNDERN
            ═══════════════════════════════════════════ */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-[#570006]/5 flex items-center justify-center">
              <svg className="w-4 h-4 text-[#570006]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="font-headline text-sm text-[#1a1a1a] tracking-tight">Passwort ändern</h2>
          </div>

          {pwMsg && (
            <div className={`mb-4 p-3 rounded-lg text-sm font-medium ${
              pwMsg.type === "success"
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}>
              {pwMsg.text}
            </div>
          )}

          <form onSubmit={handlePasswortAendern} className="space-y-3">
            <div>
              <label className="block text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase mb-1">Aktuelles Passwort</label>
              <input
                type="password"
                value={pwAktuell}
                onChange={(e) => setPwAktuell(e.target.value)}
                className="w-full px-3 py-2 border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] bg-white focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase mb-1">Neues Passwort</label>
              <input
                type="password"
                value={pwNeu}
                onChange={(e) => setPwNeu(e.target.value)}
                className="w-full px-3 py-2 border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] bg-white focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase mb-1">Passwort bestätigen</label>
              <input
                type="password"
                value={pwBestaetigung}
                onChange={(e) => setPwBestaetigung(e.target.value)}
                className="w-full px-3 py-2 border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] bg-white focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={pwLoading}
              className="w-full px-4 py-2.5 text-sm font-medium bg-[#570006] text-white rounded-lg hover:bg-[#7a1a1f] transition-colors disabled:opacity-50"
            >
              {pwLoading ? "Wird geändert..." : "Passwort ändern"}
            </button>
          </form>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          4. WEBHOOK LOGS
          ═══════════════════════════════════════════ */}
      <div className="mt-6 card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#570006]/5 flex items-center justify-center">
              <svg className="w-4 h-4 text-[#570006]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <h2 className="font-headline text-sm text-[#1a1a1a] tracking-tight">Webhook-Logs</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-[#f5f4f2] rounded-lg p-0.5">
              <button
                onClick={() => setLogFilter("alle")}
                className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${
                  logFilter === "alle"
                    ? "bg-white text-[#1a1a1a] shadow-sm"
                    : "text-[#9a9a9a] hover:text-[#6b6b6b]"
                }`}
              >
                Alle
              </button>
              <button
                onClick={() => setLogFilter("error")}
                className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${
                  logFilter === "error"
                    ? "bg-white text-red-600 shadow-sm"
                    : "text-[#9a9a9a] hover:text-[#6b6b6b]"
                }`}
              >
                Nur Fehler
              </button>
            </div>
            <button
              onClick={refreshWebhookLogs}
              className="p-1.5 text-[#c4c2bf] hover:text-[#570006] transition-colors"
              title="Aktualisieren"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <p className="text-sm text-[#c4c2bf] py-6 text-center">
            {logFilter === "error" ? "Keine Fehler gefunden." : "Noch keine Webhook-Logs vorhanden."}
          </p>
        ) : (
          <div className="overflow-x-auto -mx-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e8e6e3]">
                  <th className="text-left text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase px-6 py-2">Zeitpunkt</th>
                  <th className="text-left text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase px-3 py-2">Typ</th>
                  <th className="text-left text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase px-3 py-2">Status</th>
                  <th className="text-left text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase px-3 py-2">Bestellnr.</th>
                  <th className="text-left text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase px-6 py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log, i) => (
                  <tr
                    key={log.id}
                    className={`border-b border-[#f0eeeb] transition-colors ${
                      log.status === "error"
                        ? "bg-red-50/50 hover:bg-red-50"
                        : i % 2 === 0
                        ? "bg-white hover:bg-[#fafaf9]"
                        : "bg-[#fafaf9] hover:bg-[#f5f4f2]"
                    }`}
                  >
                    <td className="px-6 py-2.5 font-mono-amount text-[11px] text-[#6b6b6b] whitespace-nowrap">
                      {formatZeit(log.created_at)}
                    </td>
                    <td className="px-3 py-2.5">
                      <WebhookTypBadge typ={log.typ} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${
                        log.status === "success" ? "text-green-700" : "text-red-700"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          log.status === "success" ? "bg-green-500" : "bg-red-500"
                        }`} />
                        {log.status === "success" ? "OK" : "Fehler"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono-amount text-[11px] text-[#1a1a1a]">
                      {log.bestellnummer || "–"}
                    </td>
                    <td className="px-6 py-2.5 text-[11px] text-[#9a9a9a] max-w-[200px] truncate">
                      {log.fehler_text || "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Testdaten */}
      <div className="mt-6 card border-amber-200 p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="font-headline text-sm text-[#1a1a1a] tracking-tight">Testdaten</h2>
        </div>
        <p className="text-sm text-[#9a9a9a] mb-4">
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
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-[#570006] text-white rounded-lg hover:bg-[#7a1a1f] transition-colors disabled:opacity-50"
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
      <ConfirmDialog
        open={!!archivProjektConfirm}
        title="Projekt archivieren"
        message={`Soll das Projekt "${archivProjektConfirm?.name}" archiviert werden? Zugeordnete Bestellungen behalten ihre Zuordnung.`}
        confirmLabel="Archivieren"
        variant="danger"
        onConfirm={() => archivProjektConfirm && handleProjektArchiv(archivProjektConfirm.id)}
        onCancel={() => setArchivProjektConfirm(null)}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════
   Sub-Komponenten
   ═══════════════════════════════════════════ */

function StatusDot({ label, status }: { label: string; status: "online" | "offline" | "configured" }) {
  const isOk = status === "online" || status === "configured";
  return (
    <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#fafaf9]">
      <span className={`w-2 h-2 rounded-full shrink-0 ${
        isOk ? "bg-green-500" : "bg-red-500 animate-pulse"
      }`} />
      <div>
        <p className="text-[10px] text-[#c4c2bf] uppercase tracking-wider">{label}</p>
        <p className={`text-[11px] font-medium ${isOk ? "text-green-700" : "text-red-700"}`}>
          {status === "online" ? "Online" : status === "configured" ? "Konfiguriert" : "Offline"}
        </p>
      </div>
    </div>
  );
}

function WebhookTypBadge({ typ }: { typ: string }) {
  const config = {
    email: { bg: "bg-blue-50", text: "text-blue-700", label: "E-Mail" },
    extension: { bg: "bg-purple-50", text: "text-purple-700", label: "Extension" },
    cron: { bg: "bg-amber-50", text: "text-amber-700", label: "Cron" },
  }[typ] || { bg: "bg-gray-50", text: "text-gray-700", label: typ };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}
