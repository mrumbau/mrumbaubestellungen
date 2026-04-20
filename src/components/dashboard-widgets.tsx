"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardKIZusammenfassung } from "@/components/dashboard-ki";
import { DashboardPriorisierung } from "@/components/dashboard-priorisierung";
import { DashboardUnzugeordnet } from "@/components/dashboard-unzugeordnet";
import { DashboardNeueHaendler } from "@/components/dashboard-neue-haendler";
import { DashboardKiVorschlaege } from "@/components/dashboard-ki-vorschlaege";
import { DashboardNeueKunden } from "@/components/dashboard-neue-kunden";
import { DashboardNeueSubunternehmer } from "@/components/dashboard-neue-subunternehmer";
import { getStatusConfig } from "@/lib/status-config";
import { formatDatum, formatBetrag } from "@/lib/formatters";

// ─── Types ───────────────────────────────────────────────

interface BestellungItem {
  id: string;
  bestellnummer: string | null;
  haendler_name: string | null;
  besteller_name: string;
  besteller_kuerzel: string;
  betrag: number | null;
  waehrung: string;
  status: string;
  created_at: string;
}

interface TopProjekt {
  id: string;
  name: string;
  farbe: string;
  budget: number | null;
  status: string;
  stats: { gesamt: number; offen: number; volumen: number };
}

interface KiVorschlag {
  id: string;
  bestellnummer: string | null;
  haendler_name: string | null;
  projekt_vorschlag_id: string | null;
  projekt_vorschlag_konfidenz: number | null;
  projekt_vorschlag_methode: string | null;
  projekt_vorschlag_begruendung: string | null;
  lieferadresse_erkannt: string | null;
  vorschlag_projekt_name: string | null;
  vorschlag_projekt_farbe: string | null;
}

interface NeuerHaendler {
  id: string;
  name: string;
  domain: string;
  email_absender: string[];
  created_at: string;
}

interface NeuerKunde {
  id: string;
  name: string;
  keywords: string[] | null;
  created_at: string;
}

interface NeuerSubunternehmer {
  id: string;
  firma: string;
  gewerk: string | null;
  email_absender: string[];
}

interface Besteller {
  kuerzel: string;
  name: string;
}

interface UnzugeordneteBestellung {
  id: string;
  bestellnummer: string | null;
  haendler_name: string | null;
  betrag: number | null;
  waehrung: string;
  status: string;
  created_at: string;
}

export interface StatCardData {
  id: string;
  label: string;
  value: number;
  color: string;
  alert?: boolean;
  row: number;
}

interface DashboardConfig {
  stats?: Record<string, boolean>;
  widgets?: Record<string, boolean>;
}

export interface DashboardWidgetsProps {
  savedConfig: DashboardConfig;
  statCards: StatCardData[];
  freigegebenBetrag: number;
  gesamtVolumen: number;
  topProjekte: TopProjekt[];
  isAdmin: boolean;
  kiVorschlaege: KiVorschlag[];
  neueKunden: NeuerKunde[];
  unzugeordnet: UnzugeordneteBestellung[];
  bestellerListe: Besteller[];
  neueHaendler: NeuerHaendler[];
  neueSubunternehmer: NeuerSubunternehmer[];
  aktionenNoetig: BestellungItem[];
  letzte: BestellungItem[];
  bestellerStats: Record<string, number>;
  aboHinweise?: { typ: "ueberfaellig" | "kuendigung" | "vertragsende"; name: string; detail: string; dringend: boolean }[];
  aboJaehrlicheKosten?: number;
  mahnungen?: { id: string; bestellnummer: string | null; haendler_name: string | null; betrag: number | null; mahnung_am: string; mahnung_count?: number }[];
}

// ─── Stat Card Definitions ───────────────────────────────

const STAT_DEFS = [
  { id: "offen", label: "Offen" },
  { id: "abweichungen", label: "Abweichungen" },
  { id: "ls_fehlt", label: "LS fehlt" },
  { id: "freigegeben", label: "Freigegeben" },
  // "erwartet" entfernt — Extension-Signale erstellen keine Einträge mehr
  { id: "vollstaendig", label: "Vollständig" },
  { id: "gesamt", label: "Gesamt" },
  { id: "aktive_projekte", label: "Aktive Projekte" },
];

// ─── Widget Registry ─────────────────────────────────────

interface WidgetDef {
  id: string;
  label: string;
  defaultVisible: boolean;
  adminOnly?: boolean;
}

const WIDGET_DEFS: WidgetDef[] = [
  { id: "ki_zusammenfassung", label: "KI-Zusammenfassung", defaultVisible: true },
  { id: "volumen", label: "Volumen-Übersicht", defaultVisible: true },
  { id: "projekte", label: "Aktive Projekte", defaultVisible: true },
  { id: "ki_vorschlaege", label: "KI-Projekt-Vorschläge", defaultVisible: true, adminOnly: true },
  { id: "neue_kunden", label: "Neue Kunden", defaultVisible: true, adminOnly: true },
  { id: "unzugeordnet", label: "Nicht zugeordnet", defaultVisible: true, adminOnly: true },
  { id: "neue_haendler", label: "Neue Händler", defaultVisible: true, adminOnly: true },
  { id: "neue_subunternehmer", label: "Neue Subunternehmer", defaultVisible: true, adminOnly: true },
  { id: "abo_status", label: "Abo-Übersicht", defaultVisible: true },
  { id: "aktionen", label: "Aktion erforderlich", defaultVisible: true },
  { id: "letzte", label: "Letzte Bestellungen", defaultVisible: true },
  { id: "priorisierung", label: "KI-Priorisierung", defaultVisible: true },
  { id: "besteller_stats", label: "Bestellungen pro Besteller", defaultVisible: true },
];

// ─── Auto-Refresh Interval ──────────────────────────────

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// ─── Collapsible Card ────────────────────────────────────

function CollapsibleCard({
  title,
  icon,
  badge,
  defaultOpen = true,
  borderColor,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  borderColor?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="card overflow-hidden"
      style={borderColor ? { borderLeft: `3px solid ${borderColor}` } : undefined}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-input transition-colors"
      >
        <div className="flex items-center gap-2.5">
          {icon && <span className="text-foreground-subtle">{icon}</span>}
          <h2 className="font-headline text-sm text-foreground tracking-tight">{title}</h2>
          {badge}
        </div>
        <svg
          className={`w-4 h-4 text-foreground-faint transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-line-subtle">
          <div className="pt-4">{children}</div>
        </div>
      )}
    </div>
  );
}

// ─── Settings Panel ──────────────────────────────────────

function WidgetSettings({
  statsVisible,
  widgetsVisible,
  onToggleStat,
  onToggleWidget,
  onReset,
  isAdmin,
}: {
  statsVisible: Record<string, boolean>;
  widgetsVisible: Record<string, boolean>;
  onToggleStat: (id: string) => void;
  onToggleWidget: (id: string) => void;
  onReset: () => void;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const availableWidgets = WIDGET_DEFS.filter((w) => !w.adminOnly || isAdmin);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg transition-colors ${
          open
            ? "text-brand bg-brand/5 border border-brand/20"
            : "text-foreground-subtle bg-input border border-line hover:bg-line-subtle hover:text-foreground-muted"
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
        </svg>
        Anpassen
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-line shadow-lg z-50">
          <div className="px-4 py-3 border-b border-line-subtle">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">Dashboard anpassen</p>
              <button onClick={onReset} className="text-[10px] text-foreground-subtle hover:text-brand transition-colors">
                Zurücksetzen
              </button>
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {/* Statistiken */}
            <div className="px-4 pt-3 pb-1">
              <p className="text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase">Statistiken</p>
            </div>
            <div className="px-2 pb-2">
              {STAT_DEFS.map((s) => (
                <ToggleRow
                  key={s.id}
                  label={s.label}
                  active={statsVisible[s.id] !== false}
                  onToggle={() => onToggleStat(s.id)}
                />
              ))}
            </div>

            <div className="border-t border-line-subtle" />

            {/* Widgets */}
            <div className="px-4 pt-3 pb-1">
              <p className="text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase">Widgets</p>
            </div>
            <div className="px-2 pb-3">
              {availableWidgets.map((w) => (
                <ToggleRow
                  key={w.id}
                  label={w.label}
                  active={widgetsVisible[w.id] !== false}
                  onToggle={() => onToggleWidget(w.id)}
                  badge={w.adminOnly ? "Admin" : undefined}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleRow({ label, active, onToggle, badge }: { label: string; active: boolean; onToggle: () => void; badge?: string }) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-input transition-colors text-left"
    >
      <div className={`w-8 h-5 rounded-full relative transition-colors shrink-0 ${active ? "bg-brand" : "bg-line"}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${active ? "left-3.5" : "left-0.5"}`} />
      </div>
      <span className={`text-xs flex-1 ${active ? "text-foreground font-medium" : "text-foreground-subtle"}`}>{label}</span>
      {badge && <span className="text-[9px] text-foreground-faint bg-canvas px-1.5 py-0.5 rounded">{badge}</span>}
    </button>
  );
}

// ─── Stat Card ───────────────────────────────────────────

function StatCard({ label, value, color, alert }: { label: string; value: number; color: string; alert?: boolean }) {
  return (
    <div className="card card-hover p-5 relative overflow-hidden" style={{ borderTop: `3px solid ${color}` }}>
      <div className="absolute top-0 left-0 right-0 h-8 opacity-[0.07]" style={{ background: `linear-gradient(180deg, ${color}, transparent)` }} />
      <p className="text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase relative">{label}</p>
      <div className="flex items-end justify-between mt-2 relative">
        <p className={`font-mono-amount text-3xl font-bold text-foreground ${alert ? "text-red-600" : ""}`}>{value}</p>
        {alert && value > 0 && <span className="pulse-urgent w-2 h-2 rounded-full bg-red-500 mb-2" />}
      </div>
    </div>
  );
}

// ─── Action Icon ─────────────────────────────────────────

function AktionIcon({ status }: { status: string }) {
  if (status === "erwartet") {
    return (
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-foreground-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    );
  }
  if (status === "abweichung") {
    return (
      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
    );
  }
  if (status === "ls_fehlt") {
    return (
      <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
      <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
  );
}

// ─── Quick Action Button ─────────────────────────────────

function QuickAction({ bestellungId, status, onSuccess }: { bestellungId: string; status: string; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);

  if (status !== "vollstaendig") return null;

  async function handleAction(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      const endpoint = `/api/bestellungen/${bestellungId}/freigeben`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) onSuccess();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleAction}
      disabled={loading}
      className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 disabled:opacity-50 transition-colors shrink-0"
      title="Rechnung freigeben"
    >
      {loading ? (
        <div className="spinner w-3 h-3" />
      ) : (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
      Freigeben
    </button>
  );
}

// ─── Live Refresh Indicator ─────────────────────────────

function RefreshIndicator({ lastRefresh, onRefresh }: { lastRefresh: Date; onRefresh: () => void }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const diffMs = now.getTime() - lastRefresh.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const label = diffMin < 1 ? "gerade eben" : `vor ${diffMin} Min.`;

  return (
    <button
      onClick={onRefresh}
      className="flex items-center gap-1.5 text-[11px] text-foreground-faint hover:text-foreground-subtle transition-colors"
      title="Jetzt aktualisieren"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
      </svg>
      <span>Aktualisiert {label}</span>
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────

export function DashboardWidgets(props: DashboardWidgetsProps) {
  const {
    savedConfig,
    statCards,
    freigegebenBetrag,
    gesamtVolumen,
    topProjekte,
    isAdmin,
    kiVorschlaege,
    neueKunden,
    unzugeordnet,
    bestellerListe,
    neueHaendler,
    neueSubunternehmer,
    aktionenNoetig,
    letzte,
    bestellerStats,
    aboHinweise,
    aboJaehrlicheKosten,
    mahnungen,
  } = props;

  const router = useRouter();
  const [statsVisible, setStatsVisible] = useState<Record<string, boolean>>(savedConfig.stats || {});
  const [widgetsVisible, setWidgetsVisible] = useState<Record<string, boolean>>(savedConfig.widgets || {});
  const statsRef = useRef(statsVisible);
  const widgetsRef = useRef(widgetsVisible);
  statsRef.current = statsVisible;
  widgetsRef.current = widgetsVisible;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Live-Refresh: auto-reload every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
      setLastRefresh(new Date());
    }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [router]);

  function manualRefresh() {
    router.refresh();
    setLastRefresh(new Date());
  }

  // Debounced save to DB
  const saveToDb = useCallback((stats: Record<string, boolean>, widgets: Record<string, boolean>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/dashboard/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stats, widgets }),
      }).catch(() => {});
    }, 800);
  }, []);

  // Cleanup timer
  useEffect(() => {
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);

  function toggleStat(id: string) {
    setStatsVisible((prev) => {
      const next = { ...prev, [id]: prev[id] === false };
      saveToDb(next, widgetsRef.current);
      return next;
    });
  }

  function toggleWidget(id: string) {
    setWidgetsVisible((prev) => {
      const next = { ...prev, [id]: prev[id] === false };
      saveToDb(statsRef.current, next);
      return next;
    });
  }

  function resetConfig() {
    setStatsVisible({});
    setWidgetsVisible({});
    saveToDb({}, {});
  }

  function isStatVisible(id: string) { return statsVisible[id] !== false; }
  function isWidgetVisible(id: string) { return widgetsVisible[id] !== false; }

  const row1Stats = statCards.filter((s) => s.row === 1 && isStatVisible(s.id));
  const row2Stats = statCards.filter((s) => s.row === 2 && isStatVisible(s.id));
  // UNBEKANNT rausfiltern (wird im Unzugeordnet-Widget angezeigt)
  const bestellerEntries = Object.entries(bestellerStats).filter(([k]) => k !== "UNBEKANNT");

  // Map kuerzel → name
  const bestellerNameMap = new Map(bestellerListe.map((b) => [b.kuerzel, b.name]));

  return (
    <div>
      {/* Settings + Live Refresh */}
      <div className="flex items-center justify-between mb-4">
        <RefreshIndicator lastRefresh={lastRefresh} onRefresh={manualRefresh} />
        <WidgetSettings
          statsVisible={statsVisible}
          widgetsVisible={widgetsVisible}
          onToggleStat={toggleStat}
          onToggleWidget={toggleWidget}
          onReset={resetConfig}
          isAdmin={isAdmin}
        />
      </div>

      {/* Mahnungen — prominente Warnung */}
      {mahnungen && mahnungen.length > 0 && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.75h.007v.008H12v-.008z" />
            </svg>
            <h3 className="font-semibold text-red-700 text-sm">{mahnungen.length} {mahnungen.length === 1 ? "Mahnung" : "Mahnungen"} eingegangen</h3>
          </div>
          <div className="space-y-1.5">
            {mahnungen.map((m) => (
              <a key={m.id} href={`/bestellungen/${m.id}`} className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-red-100 hover:border-red-300 transition-colors text-sm">
                <span className="flex items-center gap-2">
                  <span className="font-mono-amount font-semibold text-brand">{m.bestellnummer || "–"}</span>
                  <span className="text-foreground-muted">{m.haendler_name}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-mono-amount font-medium">{m.betrag ? `${Number(m.betrag).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €` : "–"}</span>
                  {m.mahnung_count && m.mahnung_count > 1 && <span className="text-[10px] font-bold text-red-600">{m.mahnung_count}.</span>}
                  <span className="text-[10px] text-red-500">{new Date(m.mahnung_am).toLocaleDateString("de-DE")}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Stat Cards Row 1 — responsive grid */}
      {row1Stats.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {row1Stats.map((s) => (
            <StatCard key={s.id} label={s.label} value={s.value} color={s.color} alert={s.alert} />
          ))}
        </div>
      )}

      {/* Industrial line — only if both rows have cards */}
      {row1Stats.length > 0 && row2Stats.length > 0 && (
        <div className="industrial-line mb-4" />
      )}

      {/* Stat Cards Row 2 — responsive grid */}
      {row2Stats.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {row2Stats.map((s) => (
            <StatCard key={s.id} label={s.label} value={s.value} color={s.color} alert={s.alert} />
          ))}
        </div>
      )}

      {/* KI-Zusammenfassung */}
      {isWidgetVisible("ki_zusammenfassung") && (
        <DashboardKIZusammenfassung />
      )}

      {/* Volumen-Übersicht — bigger amounts */}
      {isWidgetVisible("volumen") && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="card card-hover p-5 relative overflow-hidden" style={{ borderTop: "3px solid #059669" }}>
            <div className="absolute top-0 left-0 right-0 h-8 opacity-[0.07]" style={{ background: "linear-gradient(180deg, #059669, transparent)" }} />
            <p className="text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase relative">Freigegebenes Volumen</p>
            <p className="font-mono-amount text-2xl font-bold text-foreground mt-2 relative">{formatBetrag(freigegebenBetrag)}</p>
          </div>
          <div className="card card-hover p-5 relative overflow-hidden" style={{ borderTop: "3px solid #2563eb" }}>
            <div className="absolute top-0 left-0 right-0 h-8 opacity-[0.07]" style={{ background: "linear-gradient(180deg, #2563eb, transparent)" }} />
            <p className="text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase relative">Gesamt-Volumen</p>
            <p className="font-mono-amount text-2xl font-bold text-foreground mt-2 relative">{formatBetrag(gesamtVolumen)}</p>
          </div>
        </div>
      )}

      {/* Aktive Projekte */}
      {isWidgetVisible("projekte") && topProjekte.length > 0 && (
        <div className="mb-6">
          <CollapsibleCard
            title="Aktive Projekte"
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
            }
            badge={
              <Link href="/projekte" className="text-xs text-brand hover:text-brand-light font-medium transition-colors ml-auto" onClick={(e) => e.stopPropagation()}>
                Alle anzeigen
              </Link>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {topProjekte.map((p) => {
                const budgetProzent = p.budget ? Math.min((p.stats.volumen / Number(p.budget)) * 100, 100) : 0;
                const budgetFarbe = budgetProzent > 90 ? "#dc2626" : budgetProzent > 70 ? "#d97706" : "#059669";
                return (
                  <Link key={p.id} href={`/bestellungen?projekt_id=${p.id}`} className="p-3 rounded-lg border border-line-subtle hover:bg-input hover:shadow-sm transition-all group">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.farbe }} />
                      <span className="text-sm font-semibold text-foreground group-hover:text-brand transition-colors truncate">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-foreground-subtle">
                      <span><span className="font-mono-amount font-bold text-foreground">{p.stats.gesamt}</span> Best.</span>
                      {p.stats.offen > 0 && <span><span className="font-mono-amount font-bold text-amber-600">{p.stats.offen}</span> offen</span>}
                      <span className="font-mono-amount font-bold text-foreground">{formatBetrag(p.stats.volumen)}</span>
                    </div>
                    {p.budget && (
                      <div className="mt-2">
                        <div className="w-full h-1.5 bg-line-subtle rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${budgetProzent}%`, background: budgetFarbe }} />
                        </div>
                        <p className="text-[10px] text-foreground-subtle mt-0.5 font-mono-amount">{budgetProzent.toFixed(0)}% von {formatBetrag(Number(p.budget))}</p>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </CollapsibleCard>
        </div>
      )}

      {/* Admin Widgets */}
      {isAdmin && (
        <div className="space-y-4 mb-6">
          {isWidgetVisible("ki_vorschlaege") && kiVorschlaege.length > 0 && (
            <DashboardKiVorschlaege vorschlaege={kiVorschlaege} />
          )}
          {isWidgetVisible("neue_kunden") && neueKunden.length > 0 && (
            <DashboardNeueKunden kunden={neueKunden} />
          )}
          {isWidgetVisible("unzugeordnet") && unzugeordnet.length > 0 && (
            <DashboardUnzugeordnet bestellungen={unzugeordnet} besteller={bestellerListe} />
          )}
          {isWidgetVisible("neue_haendler") && neueHaendler.length > 0 && (
            <DashboardNeueHaendler haendler={neueHaendler} />
          )}
          {isWidgetVisible("neue_subunternehmer") && neueSubunternehmer.length > 0 && (
            <DashboardNeueSubunternehmer subunternehmer={neueSubunternehmer} />
          )}
        </div>
      )}

      {/* Abo-Übersicht */}
      {isWidgetVisible("abo_status") && ((aboHinweise && aboHinweise.length > 0) || (aboJaehrlicheKosten && aboJaehrlicheKosten > 0)) && (
        <div className="mb-6">
          <CollapsibleCard
            title="Abo-Übersicht"
            borderColor="#7c3aed"
            icon={
              <svg className="w-4 h-4 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
              </svg>
            }
            badge={aboHinweise && aboHinweise.some(h => h.dringend) ? (
              <span className="font-mono-amount text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">
                {aboHinweise.filter(h => h.dringend).length}
              </span>
            ) : undefined}
          >
            {aboJaehrlicheKosten && aboJaehrlicheKosten > 0 ? (
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="p-2.5 bg-violet-50/50 rounded-lg border border-violet-100 text-center">
                  <p className="text-[10px] text-violet-500 font-medium uppercase tracking-wider">Pro Monat</p>
                  <p className="font-mono-amount text-lg font-bold text-violet-700 mt-0.5">
                    {(aboJaehrlicheKosten / 12).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
                  </p>
                </div>
                <div className="p-2.5 bg-violet-50/50 rounded-lg border border-violet-100 text-center">
                  <p className="text-[10px] text-violet-500 font-medium uppercase tracking-wider">Pro Jahr</p>
                  <p className="font-mono-amount text-lg font-bold text-violet-700 mt-0.5">
                    {aboJaehrlicheKosten.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
                  </p>
                </div>
              </div>
            ) : null}
            {aboHinweise && aboHinweise.length > 0 ? (
              <div className="space-y-1.5">
                {aboHinweise.map((h, i) => (
                  <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg ${h.dringend ? "bg-red-50 border border-red-100" : "bg-amber-50/50 border border-amber-100"}`}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${h.dringend ? "bg-red-500" : "bg-amber-500"}`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground">{h.name}</span>
                      <span className={`text-[11px] ml-2 ${h.dringend ? "text-red-600" : "text-amber-600"}`}>{h.detail}</span>
                    </div>
                    <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      h.typ === "ueberfaellig" ? "bg-red-100 text-red-700" :
                      h.typ === "kuendigung" ? "bg-amber-100 text-amber-700" :
                      "bg-violet-100 text-violet-700"
                    }`}>
                      {{ ueberfaellig: "Überfällig", kuendigung: "Kündigung", vertragsende: "Vertragsende" }[h.typ]}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-foreground-faint text-center py-2">Keine Abo-Hinweise.</p>
            )}
          </CollapsibleCard>
        </div>
      )}

      {/* Aktion erforderlich + Letzte Bestellungen */}
      {(isWidgetVisible("aktionen") || isWidgetVisible("letzte")) && (
        <div className={`grid grid-cols-1 ${isWidgetVisible("aktionen") && isWidgetVisible("letzte") ? "lg:grid-cols-2" : ""} gap-6 mb-6`}>
          {isWidgetVisible("aktionen") && (
            <CollapsibleCard
              title="Aktion erforderlich"
              borderColor="#dc2626"
              icon={
                <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              }
              badge={aktionenNoetig.length > 0 ? (
                <span className="font-mono-amount text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">
                  {aktionenNoetig.length}
                </span>
              ) : undefined}
            >
              {aktionenNoetig.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6">
                  <svg className="w-8 h-8 text-line-strong" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-foreground-faint">Keine offenen Aktionen.</p>
                </div>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {aktionenNoetig.slice(0, 10).map((b) => {
                    const s = getStatusConfig(b.status);
                    return (
                      <Link key={b.id} href={`/bestellungen/${b.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-input hover:shadow-sm transition-all group">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <AktionIcon status={b.status} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground group-hover:text-brand transition-colors truncate">
                              <span className="font-mono-amount">{b.bestellnummer || "Ohne Nr."}</span>
                              <span className="text-foreground-subtle font-normal"> – {b.haendler_name || "–"}</span>
                            </p>
                            <p className="text-[11px] text-foreground-faint">{b.besteller_name} · {formatDatum(b.created_at)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <QuickAction
                            bestellungId={b.id}
                            status={b.status}
                            onSuccess={manualRefresh}
                          />
                          <span className={`status-tag ${s.bg} ${s.text}`}>
                            <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-sm" style={{ background: s.color }} />
                            {s.label}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CollapsibleCard>
          )}

          {isWidgetVisible("letzte") && (
            <CollapsibleCard
              title="Letzte Bestellungen"
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              badge={
                <Link href="/bestellungen" className="text-xs text-brand hover:text-brand-light font-medium transition-colors ml-auto" onClick={(e) => e.stopPropagation()}>
                  Alle anzeigen
                </Link>
              }
            >
              {letzte.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6">
                  <svg className="w-8 h-8 text-line-strong" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p className="text-sm text-foreground-faint">Noch keine Bestellungen.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {letzte.map((b) => {
                    const s = getStatusConfig(b.status);
                    return (
                      <Link key={b.id} href={`/bestellungen/${b.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-input hover:shadow-sm transition-all group">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground group-hover:text-brand transition-colors truncate">
                            <span className="font-mono-amount">{b.bestellnummer || "Ohne Nr."}</span>
                            <span className="text-foreground-subtle font-normal"> – {b.haendler_name || "–"}</span>
                          </p>
                          <p className="text-[11px] text-foreground-faint">{b.besteller_name} · {formatDatum(b.created_at)}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-2">
                          {b.betrag && (
                            <span className="font-mono-amount text-sm font-semibold text-foreground hidden sm:inline">{formatBetrag(b.betrag, b.waehrung || "EUR")}</span>
                          )}
                          <span className={`status-tag ${s.bg} ${s.text}`}>
                            <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-sm" style={{ background: s.color }} />
                            {s.label}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CollapsibleCard>
          )}
        </div>
      )}

      {/* KI-Priorisierung */}
      {isWidgetVisible("priorisierung") && (
        <div className="mb-6">
          <DashboardPriorisierung />
        </div>
      )}

      {/* Bestellungen pro Besteller — Team-Transparenz (Firmeninhaber wollen sehen, wer wieviel bestellt) */}
      {isWidgetVisible("besteller_stats") && bestellerEntries.length > 0 && (
        <div className="mb-6">
          <CollapsibleCard
            title="Bestellungen pro Besteller"
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {bestellerEntries
                .sort((a, b) => b[1] - a[1])
                .map(([kuerzel, count]) => {
                  const name = bestellerNameMap.get(kuerzel);
                  const maxCount = Math.max(...bestellerEntries.map(([, c]) => c));
                  const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0;
                  return (
                    <div key={kuerzel} className="p-4 rounded-lg bg-input border border-line-subtle relative overflow-hidden">
                      {/* Background bar */}
                      <div
                        className="absolute bottom-0 left-0 h-1 bg-brand/10 rounded-full"
                        style={{ width: `${barWidth}%` }}
                      />
                      <div className="flex items-center gap-3 relative">
                        <div className="w-10 h-10 rounded-lg bg-brand text-white flex items-center justify-center text-xs font-bold shrink-0">
                          {kuerzel}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{name || kuerzel}</p>
                          <div className="flex items-baseline gap-1">
                            <p className="font-mono-amount text-xl font-bold text-foreground">{count}</p>
                            <p className="text-[10px] text-foreground-subtle uppercase tracking-wide">Bestellungen</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CollapsibleCard>
        </div>
      )}
    </div>
  );
}
