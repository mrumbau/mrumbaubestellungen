"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { TimeRangePicker, type TimeRange } from "@/components/ui/time-range-picker";
import { DashboardKIZusammenfassung } from "@/components/dashboard-ki";
import { DashboardPriorisierung } from "@/components/dashboard-priorisierung";
import { DashboardUnzugeordnet } from "@/components/dashboard-unzugeordnet";
import { DashboardNeueHaendler } from "@/components/dashboard-neue-haendler";
import { DashboardKiVorschlaege } from "@/components/dashboard-ki-vorschlaege";
import { DashboardNeueKunden } from "@/components/dashboard-neue-kunden";
import { DashboardNeueSubunternehmer } from "@/components/dashboard-neue-subunternehmer";
import { Sparkline } from "@/components/ui/sparkline";
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

export interface KiCacheEintrag {
  typ: string;
  inhalt: unknown;
  generated_at: string;
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
  /** @deprecated Peer-Stats wurden nach /einstellungen verschoben. Prop bleibt für API-Kompatibilität, wird nicht mehr gerendert. */
  bestellerStats?: Record<string, number>;
  aboHinweise?: { typ: "ueberfaellig" | "kuendigung" | "vertragsende"; name: string; detail: string; dringend: boolean }[];
  aboJaehrlicheKosten?: number;
  mahnungen?: { id: string; bestellnummer: string | null; haendler_name: string | null; betrag: number | null; mahnung_am: string; mahnung_count?: number }[];
  kiZusammenfassungCache?: KiCacheEintrag | null;
  kiPriorisierungCache?: KiCacheEintrag | null;
  /** Trend-Daten für Volumen-Widget (Sparkline + Delta vs. Vergleichs-Range) */
  volumenTrend?: {
    freigegebenSparkline: number[];
    gesamtSparkline: number[];
    freigegebenMoM: number | null;
    gesamtMoM: number | null;
    /** Menschenlesbares Label des aktuellen Zeitraums ("Letzte 30 Tage", "März 2026") */
    rangeLabel: string;
  };
  /** Aktuell ausgewählter Zeitraum (aus URL-Param gesteuert) */
  range?: TimeRange;
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

// Widget-Role-Matrix:
//   adminOnly = true  →  nur Admin sieht das Widget (echte System-Pflege)
//   adminOnly = false →  Besteller + Admin (fachliche Entscheidungen, Firmeninhaber-Kontext)
// Buchhaltung sieht das Dashboard gar nicht (Middleware + Page-Guard redirecten nach /buchhaltung).
const WIDGET_DEFS: WidgetDef[] = [
  { id: "ki_zusammenfassung", label: "KI-Zusammenfassung", defaultVisible: true },
  { id: "volumen", label: "Volumen-Übersicht", defaultVisible: true },
  { id: "projekte", label: "Aktive Projekte", defaultVisible: true },
  // Fachliche Stammdaten-Pflege: Admin + Besteller (Firmeninhaber kennen die Fachdaten)
  { id: "ki_vorschlaege", label: "KI-Projekt-Vorschläge", defaultVisible: true },
  { id: "neue_kunden", label: "Neue Kunden", defaultVisible: true },
  { id: "neue_subunternehmer", label: "Neue Subunternehmer", defaultVisible: true },
  { id: "neue_haendler", label: "Neue Händler", defaultVisible: true },
  // System-Operation (Bestellung einem Besteller zuweisen): nur Admin
  { id: "unzugeordnet", label: "Nicht zugeordnet", defaultVisible: true, adminOnly: true },
  { id: "abo_status", label: "Abo-Übersicht", defaultVisible: true },
  { id: "aktionen", label: "Offene Bestellungen", defaultVisible: true },
  { id: "letzte", label: "Letzte Bestellungen", defaultVisible: true },
  { id: "priorisierung", label: "KI-Priorisierung", defaultVisible: true },
  // besteller_stats wurde nach /einstellungen verschoben — Dashboard bleibt Workflow-fokussiert
];

// ─── Auto-Refresh Interval ──────────────────────────────

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// ─── Density-Persistence ─────────────────────────────────
const DENSITY_STORAGE_KEY = "dashboard-density";
function loadDensity(): Density {
  if (typeof window === "undefined") return "comfortable";
  const v = window.localStorage.getItem(DENSITY_STORAGE_KEY);
  return v === "compact" ? "compact" : "comfortable";
}

// ─── Density-Toggle-Button ───────────────────────────────
function DensityToggle({ density, onToggle }: { density: Density; onToggle: () => void }) {
  const isCompact = density === "compact";
  return (
    <button
      onClick={onToggle}
      aria-label={isCompact ? "Komfortable Ansicht" : "Kompakte Ansicht"}
      title={isCompact ? "Komfortable Ansicht" : "Kompakte Ansicht"}
      className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg transition-colors text-foreground-subtle bg-input border border-line hover:bg-line-subtle hover:text-foreground-muted"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {isCompact ? (
          // Komfortabel-Icon (große Boxen)
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        ) : (
          // Kompakt-Icon (drei Zeilen)
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
        )}
      </svg>
      {isCompact ? "Komfortabel" : "Kompakt"}
    </button>
  );
}

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

// ─── Density ─────────────────────────────────────────────
type Density = "comfortable" | "compact";

// ─── Stat Card ───────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  alert,
  density,
}: {
  label: string;
  value: number;
  color: string;
  alert?: boolean;
  density: Density;
}) {
  const padding = density === "compact" ? "p-3" : "p-5";
  const gradientHeight = density === "compact" ? "h-6" : "h-8";
  const valueSize = density === "compact" ? "text-xl" : "text-3xl";
  const valueSpacing = density === "compact" ? "mt-1" : "mt-2";
  return (
    <div className={`card card-hover ${padding} relative overflow-hidden`} style={{ borderTop: `3px solid ${color}` }}>
      <div className={`absolute top-0 left-0 right-0 ${gradientHeight} opacity-[0.07]`} style={{ background: `linear-gradient(180deg, ${color}, transparent)` }} />
      <p className="text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase relative">{label}</p>
      <div className={`flex items-end justify-between ${valueSpacing} relative`}>
        <p className={`font-mono-amount ${valueSize} font-bold text-foreground ${alert ? "text-error" : ""}`}>{value}</p>
        {alert && value > 0 && <span className="pulse-urgent w-2 h-2 rounded-full bg-error mb-2" />}
      </div>
    </div>
  );
}

// Vergleichs-Label für MoM-Delta, abhängig vom Range
function comparisonLabelFor(range: TimeRange): string {
  switch (range) {
    case "7d": return "vs. 7 T davor";
    case "30d": return "vs. 30 T davor";
    case "90d": return "vs. 90 T davor";
    case "month": return "vs. Vormonat";
    case "prev-month": return "vs. Vor-Vormonat";
  }
}

// ─── Volumen Card ────────────────────────────────────────

function VolumenCard({
  label,
  amount,
  color,
  sparkline,
  momProzent,
  comparisonLabel,
  density,
}: {
  label: string;
  amount: number;
  color: string;
  sparkline?: number[];
  momProzent: number | null;
  /** "vs. Vormonat", "vs. 30T davor" etc — range-abhängig vom Caller */
  comparisonLabel: string;
  density: Density;
}) {
  const padding = density === "compact" ? "p-3" : "p-5";
  const gradientHeight = density === "compact" ? "h-6" : "h-8";
  const amountSize = density === "compact" ? "text-lg" : "text-2xl";
  const amountSpacing = density === "compact" ? "mt-1" : "mt-2";
  const sparklineHeight = density === "compact" ? 18 : 24;

  // MoM-Richtung: Pfeil als Icon, Farbe bewusst neutral (foreground-muted) —
  // ein fallendes Volumen ist nicht automatisch "rot" (Jahreszeiten, Urlaubszeiten).
  // Nur das Vorzeichen zeigt Richtung, nicht das Ausmaß eines Problems.
  const hasDelta = momProzent !== null && Number.isFinite(momProzent);
  const pfeil =
    !hasDelta ? null : momProzent > 0.5 ? "↑" : momProzent < -0.5 ? "↓" : "→";
  const prozentText = hasDelta ? `${Math.abs(momProzent as number).toFixed(0)}%` : null;

  return (
    <div
      className={`card card-hover ${padding} relative overflow-hidden`}
      style={{ borderTop: `3px solid ${color}` }}
    >
      <div
        className={`absolute top-0 left-0 right-0 ${gradientHeight} opacity-[0.07]`}
        style={{ background: `linear-gradient(180deg, ${color}, transparent)` }}
        aria-hidden="true"
      />
      <p className="text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase relative">
        {label}
      </p>
      <p className={`font-mono-amount ${amountSize} ${amountSpacing} font-bold text-foreground relative`}>
        {formatBetrag(amount)}
      </p>
      {(sparkline && sparkline.length > 1) || hasDelta ? (
        <div className="flex items-center justify-between gap-3 mt-2 relative">
          {sparkline && sparkline.length > 1 ? (
            <Sparkline
              data={sparkline}
              color={color}
              height={sparklineHeight}
              width={80}
              ariaLabel={`${label} Trend der letzten 14 Tage`}
            />
          ) : (
            <span />
          )}
          {hasDelta && (
            <span className="text-[11px] font-mono-amount text-foreground-muted whitespace-nowrap">
              <span aria-hidden="true">{pfeil}</span> {prozentText}
              <span className="text-foreground-subtle ml-1">{comparisonLabel}</span>
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ─── Action Icon ─────────────────────────────────────────

function AktionIcon({ status }: { status: string }) {
  if (status === "erwartet") {
    return (
      <div className="w-8 h-8 rounded-lg bg-canvas flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-foreground-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    );
  }
  if (status === "abweichung") {
    return (
      <div className="w-8 h-8 rounded-lg bg-error-bg flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>
    );
  }
  if (status === "ls_fehlt") {
    return (
      <div className="w-8 h-8 rounded-lg bg-warning-bg flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-lg bg-success-bg flex items-center justify-center shrink-0">
      <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
      className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-success bg-success-bg border border-success-border rounded-md hover:opacity-80 disabled:opacity-50 transition-colors shrink-0"
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
    aboHinweise,
    aboJaehrlicheKosten,
    mahnungen,
    kiZusammenfassungCache,
    kiPriorisierungCache,
    volumenTrend,
    range = "30d",
  } = props;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [statsVisible, setStatsVisible] = useState<Record<string, boolean>>(savedConfig.stats || {});
  const [widgetsVisible, setWidgetsVisible] = useState<Record<string, boolean>>(savedConfig.widgets || {});
  const statsRef = useRef(statsVisible);
  const widgetsRef = useRef(widgetsVisible);
  statsRef.current = statsVisible;
  widgetsRef.current = widgetsVisible;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [density, setDensity] = useState<Density>("comfortable");

  // Density aus localStorage beim Mount laden (nicht SSR — daher useEffect)
  useEffect(() => {
    setDensity(loadDensity());
  }, []);

  function toggleDensity() {
    setDensity((prev) => {
      const next = prev === "comfortable" ? "compact" : "comfortable";
      if (typeof window !== "undefined") {
        window.localStorage.setItem(DENSITY_STORAGE_KEY, next);
      }
      return next;
    });
  }

  // Range ändern: URL-Param aktualisieren → Server-Page rendert neu mit anderem Range.
  // router.push (statt replace), damit Browser-Back funktioniert.
  function changeRange(next: TimeRange) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (next === "30d") {
      // Default nicht persistieren — cleaner URL
      params.delete("range");
    } else {
      params.set("range", next);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

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

  // "Zu prüfen"-Section: aggregierter Count über alle gerenderten Confirm-Widgets.
  // Role-dependent: Admin sieht Unzugeordnet (System-Op), Besteller nicht. Das ergibt
  // unterschiedliche Counts (z.B. MH=12, MT=9) — gewollt, nicht global firmenweit.
  // Jedes Widget wird nur gezählt wenn es auch tatsächlich rendert (Toggle AN + Items > 0).
  const confirmCount =
    (isAdmin && isWidgetVisible("unzugeordnet") ? unzugeordnet.length : 0) +
    (isWidgetVisible("ki_vorschlaege") ? kiVorschlaege.length : 0) +
    (isWidgetVisible("neue_kunden") ? neueKunden.length : 0) +
    (isWidgetVisible("neue_subunternehmer") ? neueSubunternehmer.length : 0) +
    (isWidgetVisible("neue_haendler") ? neueHaendler.length : 0);

  return (
    <div>
      {/* Settings-Row: Refresh links, rechts Range-Picker + Density + Widget-Settings */}
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <RefreshIndicator lastRefresh={lastRefresh} onRefresh={manualRefresh} />
        <div className="flex items-center gap-2 flex-wrap">
          <TimeRangePicker value={range} onChange={changeRange} />
          <DensityToggle density={density} onToggle={toggleDensity} />
          <WidgetSettings
            statsVisible={statsVisible}
            widgetsVisible={widgetsVisible}
            onToggleStat={toggleStat}
            onToggleWidget={toggleWidget}
            onReset={resetConfig}
            isAdmin={isAdmin}
          />
        </div>
      </div>

      {/* Mahnungen — prominente Warnung (Error-Semantik) */}
      {mahnungen && mahnungen.length > 0 && (
        <div className="mb-4 bg-error-bg border border-error-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.75h.007v.008H12v-.008z" />
            </svg>
            <h3 className="font-semibold text-error text-sm">{mahnungen.length} {mahnungen.length === 1 ? "Mahnung" : "Mahnungen"} eingegangen</h3>
          </div>
          <div className="space-y-1.5">
            {mahnungen.map((m) => (
              <a key={m.id} href={`/bestellungen/${m.id}`} className="flex items-center justify-between px-3 py-2 bg-surface rounded-lg border border-error-border/60 hover:border-error-border transition-colors text-sm">
                <span className="flex items-center gap-2">
                  <span className="font-mono-amount font-semibold text-brand">{m.bestellnummer || "–"}</span>
                  <span className="text-foreground-muted">{m.haendler_name}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-mono-amount font-medium">{m.betrag ? `${Number(m.betrag).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €` : "–"}</span>
                  {m.mahnung_count && m.mahnung_count > 1 && <span className="text-[10px] font-bold text-error">{m.mahnung_count}.</span>}
                  <span className="text-[10px] text-error">{new Date(m.mahnung_am).toLocaleDateString("de-DE")}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Zu prüfen — Confirm-Queue am Top, direkt unter Mahnungen.
          Section rendert komplett nicht wenn confirmCount === 0 (keine leere Shell, kein "Aufgeräumt"-Empty).
          Reihenfolge identisch für Admin + Besteller — Unzugeordnet (admin-only) erscheint oben oder ist einfach null bei Besteller. */}
      {confirmCount > 0 && (
        <section aria-labelledby="zu-pruefen-heading" className="mb-6">
          <div className="flex items-baseline justify-between mb-3">
            <h2
              id="zu-pruefen-heading"
              className="font-headline text-[11px] uppercase tracking-[0.14em] text-foreground-subtle"
            >
              Zu prüfen
            </h2>
            <span
              className="font-mono-amount text-[11px] text-foreground-muted"
              aria-label={`${confirmCount} ${confirmCount === 1 ? "Eintrag" : "Einträge"} zur Prüfung`}
            >
              {confirmCount}
            </span>
          </div>
          <div className="space-y-4">
            {isAdmin && isWidgetVisible("unzugeordnet") && unzugeordnet.length > 0 && (
              <DashboardUnzugeordnet bestellungen={unzugeordnet} besteller={bestellerListe} />
            )}
            {isWidgetVisible("ki_vorschlaege") && kiVorschlaege.length > 0 && (
              <DashboardKiVorschlaege vorschlaege={kiVorschlaege} />
            )}
            {isWidgetVisible("neue_kunden") && neueKunden.length > 0 && (
              <DashboardNeueKunden kunden={neueKunden} />
            )}
            {isWidgetVisible("neue_subunternehmer") && neueSubunternehmer.length > 0 && (
              <DashboardNeueSubunternehmer subunternehmer={neueSubunternehmer} />
            )}
            {isWidgetVisible("neue_haendler") && neueHaendler.length > 0 && (
              <DashboardNeueHaendler haendler={neueHaendler} />
            )}
          </div>
        </section>
      )}

      {/* --- HANDLUNG-Cluster: was muss ich konkret tun? ---
          Offene Bestellungen + Letzte Bestellungen als Kontext-Paar,
          gefolgt von KI-Priorisierung (empfiehlt die Reihenfolge). */}
      {(isWidgetVisible("aktionen") || isWidgetVisible("letzte")) && (
        <div className={`grid grid-cols-1 ${isWidgetVisible("aktionen") && isWidgetVisible("letzte") ? "lg:grid-cols-2" : ""} gap-6 mb-6`}>
          {isWidgetVisible("aktionen") && (
            <CollapsibleCard
              title="Offene Bestellungen"
              borderColor="var(--status-abweichung)"
              icon={
                <svg className="w-4 h-4 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              }
              badge={aktionenNoetig.length > 0 ? (
                <span className="font-mono-amount text-[10px] font-bold text-error bg-error-bg px-2 py-0.5 rounded">
                  {aktionenNoetig.length}
                </span>
              ) : undefined}
            >
              {aktionenNoetig.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6">
                  <svg className="w-8 h-8 text-line-strong" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-foreground-faint">Keine offenen Bestellungen.</p>
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
                            <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-sm" style={{ background: s.color }} />
                            <s.Icon className="w-3 h-3 mr-1 shrink-0" aria-hidden="true" />
                            <span className="sr-only">Status: </span>
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
                            <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-sm" style={{ background: s.color }} />
                            <s.Icon className="w-3 h-3 mr-1 shrink-0" aria-hidden="true" />
                            <span className="sr-only">Status: </span>
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

      {/* KI-Priorisierung — schließt den Handlung-Cluster ab: "in welcher Reihenfolge?" */}
      {isWidgetVisible("priorisierung") && (
        <div className="mb-6">
          <DashboardPriorisierung
            initial={kiPriorisierungCache?.inhalt as Parameters<typeof DashboardPriorisierung>[0]["initial"] ?? null}
            initialGeneratedAt={kiPriorisierungCache?.generated_at ?? null}
          />
        </div>
      )}

      {/* --- ÜBERSICHT-Cluster: wie steht's? --- */}

      {/* Stat Cards Row 1 — responsive grid */}
      {row1Stats.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {row1Stats.map((s) => (
            <StatCard key={s.id} label={s.label} value={s.value} color={s.color} alert={s.alert} density={density} />
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
            <StatCard key={s.id} label={s.label} value={s.value} color={s.color} alert={s.alert} density={density} />
          ))}
        </div>
      )}

      {/* Volumen-Übersicht — Range-scoped: Werte, Sparkline, Delta beziehen sich auf aktuellen Zeitraum.
          Farbigkeit disziplinär: Freigegeben = Status-Grün, Gesamt = Brand-Rot. */}
      {isWidgetVisible("volumen") && (
        <div className="mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <VolumenCard
              label="Freigegebenes Volumen"
              amount={freigegebenBetrag}
              color="var(--status-freigegeben)"
              sparkline={volumenTrend?.freigegebenSparkline}
              momProzent={volumenTrend?.freigegebenMoM ?? null}
              comparisonLabel={comparisonLabelFor(range)}
              density={density}
            />
            <VolumenCard
              label="Gesamt-Volumen"
              amount={gesamtVolumen}
              color="var(--mr-red)"
              sparkline={volumenTrend?.gesamtSparkline}
              momProzent={volumenTrend?.gesamtMoM ?? null}
              comparisonLabel={comparisonLabelFor(range)}
              density={density}
            />
          </div>
          {volumenTrend?.rangeLabel && (
            <p className="text-[10px] text-foreground-subtle mt-2 font-mono-amount">
              Zeitraum: {volumenTrend.rangeLabel}
            </p>
          )}
        </div>
      )}

      {/* KI-Zusammenfassung — narrativ, fasst die Zahlen oben zusammen.
          Cache-initialisiert + range-aware: Cache wird nur verwendet wenn er zum aktuellen Range passt. */}
      {isWidgetVisible("ki_zusammenfassung") && (
        <DashboardKIZusammenfassung
          initial={kiZusammenfassungCache?.inhalt as Parameters<typeof DashboardKIZusammenfassung>[0]["initial"] ?? null}
          initialGeneratedAt={kiZusammenfassungCache?.generated_at ?? null}
          currentRange={range}
        />
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
                      {p.stats.offen > 0 && <span><span className="font-mono-amount font-bold text-warning">{p.stats.offen}</span> offen</span>}
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

      {/* --- KONTEXT-Cluster: was passiert drumherum? --- */}

      {/* Abo-Übersicht — Kosten neutral (informativ), Hinweise semantic (Status-Farben bei echter Dringlichkeit) */}
      {isWidgetVisible("abo_status") && ((aboHinweise && aboHinweise.length > 0) || (aboJaehrlicheKosten && aboJaehrlicheKosten > 0)) && (
        <div className="mb-6">
          <CollapsibleCard
            title="Abo-Übersicht"
            icon={
              <svg className="w-4 h-4 text-foreground-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
              </svg>
            }
            badge={aboHinweise && aboHinweise.some(h => h.dringend) ? (
              <span className="font-mono-amount text-[10px] font-bold text-error bg-error-bg px-2 py-0.5 rounded">
                {aboHinweise.filter(h => h.dringend).length}
              </span>
            ) : undefined}
          >
            {aboJaehrlicheKosten && aboJaehrlicheKosten > 0 ? (
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="p-2.5 bg-canvas rounded-lg border border-line-subtle text-center">
                  <p className="text-[10px] text-foreground-subtle font-medium uppercase tracking-wider">Pro Monat</p>
                  <p className="font-mono-amount text-lg font-bold text-foreground mt-0.5">
                    {(aboJaehrlicheKosten / 12).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
                  </p>
                </div>
                <div className="p-2.5 bg-canvas rounded-lg border border-line-subtle text-center">
                  <p className="text-[10px] text-foreground-subtle font-medium uppercase tracking-wider">Pro Jahr</p>
                  <p className="font-mono-amount text-lg font-bold text-foreground mt-0.5">
                    {aboJaehrlicheKosten.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
                  </p>
                </div>
              </div>
            ) : null}
            {aboHinweise && aboHinweise.length > 0 ? (
              <div className="space-y-1.5">
                {aboHinweise.map((h, i) => (
                  <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg border ${h.dringend ? "bg-error-bg border-error-border" : "bg-warning-bg border-warning-border"}`}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${h.dringend ? "bg-error" : "bg-warning"}`} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-foreground">{h.name}</span>
                      <span className={`text-[11px] ml-2 ${h.dringend ? "text-error" : "text-warning"}`}>{h.detail}</span>
                    </div>
                    <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      h.typ === "ueberfaellig" ? "bg-error-bg text-error" :
                      h.typ === "kuendigung" ? "bg-warning-bg text-warning" :
                      "bg-canvas text-foreground-muted"
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

    </div>
  );
}
