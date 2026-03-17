"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { DashboardKIZusammenfassung } from "@/components/dashboard-ki";
import { DashboardPriorisierung } from "@/components/dashboard-priorisierung";
import { DashboardUnzugeordnet } from "@/components/dashboard-unzugeordnet";
import { DashboardNeueHaendler } from "@/components/dashboard-neue-haendler";
import { DashboardKiVorschlaege } from "@/components/dashboard-ki-vorschlaege";
import { DashboardNeueKunden } from "@/components/dashboard-neue-kunden";
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
  aktionenNoetig: BestellungItem[];
  letzte: BestellungItem[];
  bestellerStats: Record<string, number>;
}

// ─── Stat Card Definitions ───────────────────────────────

const STAT_DEFS = [
  { id: "offen", label: "Offen" },
  { id: "abweichungen", label: "Abweichungen" },
  { id: "ls_fehlt", label: "LS fehlt" },
  { id: "freigegeben", label: "Freigegeben" },
  { id: "erwartet", label: "Erwartet" },
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
  { id: "aktionen", label: "Aktion erforderlich", defaultVisible: true },
  { id: "letzte", label: "Letzte Bestellungen", defaultVisible: true },
  { id: "priorisierung", label: "KI-Priorisierung", defaultVisible: true },
  { id: "besteller_stats", label: "Bestellungen pro Besteller", defaultVisible: true },
];

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
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#fafaf9] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          {icon && <span className="text-[#9a9a9a]">{icon}</span>}
          <h2 className="font-headline text-sm text-[#1a1a1a] tracking-tight">{title}</h2>
          {badge}
        </div>
        <svg
          className={`w-4 h-4 text-[#c4c2bf] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className={`transition-all duration-200 ease-in-out overflow-hidden ${open ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="px-5 pb-5 border-t border-[#f0eeeb]">
          <div className="pt-4">{children}</div>
        </div>
      </div>
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
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const availableWidgets = WIDGET_DEFS.filter((w) => !w.adminOnly || isAdmin);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg transition-colors ${
          open
            ? "text-[#570006] bg-[#570006]/5 border border-[#570006]/20"
            : "text-[#9a9a9a] bg-[#fafaf9] border border-[#e8e6e3] hover:bg-[#f0eeeb] hover:text-[#6b6b6b]"
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
        </svg>
        Anpassen
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-[#e8e6e3] shadow-lg z-50">
          <div className="px-4 py-3 border-b border-[#f0eeeb]">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[#1a1a1a]">Dashboard anpassen</p>
              <button onClick={onReset} className="text-[10px] text-[#9a9a9a] hover:text-[#570006] transition-colors">
                Zurücksetzen
              </button>
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {/* Statistiken */}
            <div className="px-4 pt-3 pb-1">
              <p className="text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase">Statistiken</p>
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

            <div className="border-t border-[#f0eeeb]" />

            {/* Widgets */}
            <div className="px-4 pt-3 pb-1">
              <p className="text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase">Widgets</p>
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
      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#fafaf9] transition-colors text-left"
    >
      <div className={`w-8 h-5 rounded-full relative transition-colors shrink-0 ${active ? "bg-[#570006]" : "bg-[#e8e6e3]"}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${active ? "left-3.5" : "left-0.5"}`} />
      </div>
      <span className={`text-xs flex-1 ${active ? "text-[#1a1a1a] font-medium" : "text-[#9a9a9a]"}`}>{label}</span>
      {badge && <span className="text-[9px] text-[#c4c2bf] bg-[#f5f4f2] px-1.5 py-0.5 rounded">{badge}</span>}
    </button>
  );
}

// ─── Stat Card ───────────────────────────────────────────

function StatCard({ label, value, color, alert }: { label: string; value: number; color: string; alert?: boolean }) {
  return (
    <div className="card card-hover p-5 relative overflow-hidden" style={{ borderTop: `3px solid ${color}` }}>
      <div className="absolute top-0 left-0 right-0 h-8 opacity-[0.07]" style={{ background: `linear-gradient(180deg, ${color}, transparent)` }} />
      <p className="text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase relative">{label}</p>
      <div className="flex items-end justify-between mt-2 relative">
        <p className={`font-mono-amount text-3xl font-bold text-[#1a1a1a] ${alert ? "text-red-600" : ""}`}>{value}</p>
        {alert && value > 0 && <span className="pulse-urgent w-2 h-2 rounded-full bg-red-500 mb-2" />}
      </div>
    </div>
  );
}

// ─── Action Icon ─────────────────────────────────────────

function AktionIcon({ status }: { status: string }) {
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
    aktionenNoetig,
    letzte,
    bestellerStats,
  } = props;

  const [statsVisible, setStatsVisible] = useState<Record<string, boolean>>(savedConfig.stats || {});
  const [widgetsVisible, setWidgetsVisible] = useState<Record<string, boolean>>(savedConfig.widgets || {});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      saveToDb(next, widgetsVisible);
      return next;
    });
  }

  function toggleWidget(id: string) {
    setWidgetsVisible((prev) => {
      const next = { ...prev, [id]: prev[id] === false };
      saveToDb(statsVisible, next);
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
  const bestellerEntries = Object.entries(bestellerStats);

  return (
    <div>
      {/* Settings */}
      <div className="flex items-center justify-end mb-4">
        <WidgetSettings
          statsVisible={statsVisible}
          widgetsVisible={widgetsVisible}
          onToggleStat={toggleStat}
          onToggleWidget={toggleWidget}
          onReset={resetConfig}
          isAdmin={isAdmin}
        />
      </div>

      {/* Stat Cards Row 1 */}
      {row1Stats.length > 0 && (
        <div className={`grid gap-4 mb-4`} style={{ gridTemplateColumns: `repeat(${Math.min(row1Stats.length, 4)}, minmax(0, 1fr))` }}>
          {row1Stats.map((s) => (
            <StatCard key={s.id} label={s.label} value={s.value} color={s.color} alert={s.alert} />
          ))}
        </div>
      )}

      {/* Industrial line — only if both rows have cards */}
      {row1Stats.length > 0 && row2Stats.length > 0 && (
        <div className="industrial-line mb-4" />
      )}

      {/* Stat Cards Row 2 */}
      {row2Stats.length > 0 && (
        <div className={`grid gap-4 mb-6`} style={{ gridTemplateColumns: `repeat(${Math.min(row2Stats.length, 4)}, minmax(0, 1fr))` }}>
          {row2Stats.map((s) => (
            <StatCard key={s.id} label={s.label} value={s.value} color={s.color} alert={s.alert} />
          ))}
        </div>
      )}

      {/* KI-Zusammenfassung */}
      {isWidgetVisible("ki_zusammenfassung") && (
        <DashboardKIZusammenfassung />
      )}

      {/* Volumen-Übersicht */}
      {isWidgetVisible("volumen") && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="card card-hover p-5 relative overflow-hidden" style={{ borderTop: "3px solid #059669" }}>
            <div className="absolute top-0 left-0 right-0 h-8 opacity-[0.07]" style={{ background: "linear-gradient(180deg, #059669, transparent)" }} />
            <p className="text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase relative">Freigegebenes Volumen</p>
            <p className="font-mono-amount text-xl font-bold text-[#1a1a1a] mt-2 relative">{formatBetrag(freigegebenBetrag)}</p>
          </div>
          <div className="card card-hover p-5 relative overflow-hidden" style={{ borderTop: "3px solid #2563eb" }}>
            <div className="absolute top-0 left-0 right-0 h-8 opacity-[0.07]" style={{ background: "linear-gradient(180deg, #2563eb, transparent)" }} />
            <p className="text-[10px] font-semibold text-[#9a9a9a] tracking-widest uppercase relative">Gesamt-Volumen</p>
            <p className="font-mono-amount text-xl font-bold text-[#1a1a1a] mt-2 relative">{formatBetrag(gesamtVolumen)}</p>
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
              <Link href="/projekte" className="text-xs text-[#570006] hover:text-[#7a1a1f] font-medium transition-colors ml-auto" onClick={(e) => e.stopPropagation()}>
                Alle anzeigen
              </Link>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {topProjekte.map((p) => {
                const budgetProzent = p.budget ? Math.min((p.stats.volumen / Number(p.budget)) * 100, 100) : 0;
                const budgetFarbe = budgetProzent > 90 ? "#dc2626" : budgetProzent > 70 ? "#d97706" : "#059669";
                return (
                  <Link key={p.id} href={`/bestellungen?projekt_id=${p.id}`} className="p-3 rounded-lg border border-[#f0eeeb] hover:bg-[#fafaf9] hover:shadow-sm transition-all group">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.farbe }} />
                      <span className="text-sm font-semibold text-[#1a1a1a] group-hover:text-[#570006] transition-colors truncate">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-[#9a9a9a]">
                      <span><span className="font-mono-amount font-bold text-[#1a1a1a]">{p.stats.gesamt}</span> Best.</span>
                      {p.stats.offen > 0 && <span><span className="font-mono-amount font-bold text-amber-600">{p.stats.offen}</span> offen</span>}
                      <span className="font-mono-amount font-bold text-[#1a1a1a]">{formatBetrag(p.stats.volumen)}</span>
                    </div>
                    {p.budget && (
                      <div className="mt-2">
                        <div className="w-full h-1.5 bg-[#f0eeeb] rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${budgetProzent}%`, background: budgetFarbe }} />
                        </div>
                        <p className="text-[10px] text-[#9a9a9a] mt-0.5 font-mono-amount">{budgetProzent.toFixed(0)}% von {formatBetrag(Number(p.budget))}</p>
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
                <p className="text-sm text-[#c4c2bf] py-2 text-center">Keine offenen Aktionen.</p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {aktionenNoetig.slice(0, 10).map((b) => {
                    const s = getStatusConfig(b.status);
                    return (
                      <Link key={b.id} href={`/bestellungen/${b.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-[#fafaf9] hover:shadow-sm transition-all group">
                        <div className="flex items-center gap-3">
                          <AktionIcon status={b.status} />
                          <div>
                            <p className="text-sm font-medium text-[#1a1a1a] group-hover:text-[#570006] transition-colors">
                              <span className="font-mono-amount">{b.bestellnummer || "Ohne Nr."}</span>
                              <span className="text-[#9a9a9a] font-normal"> – {b.haendler_name || "–"}</span>
                            </p>
                            <p className="text-[11px] text-[#c4c2bf]">{b.besteller_name} · {formatDatum(b.created_at)}</p>
                          </div>
                        </div>
                        <span className={`status-tag ${s.bg} ${s.text}`}>
                          <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-sm" style={{ background: s.color }} />
                          {s.label}
                        </span>
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
                <Link href="/bestellungen" className="text-xs text-[#570006] hover:text-[#7a1a1f] font-medium transition-colors ml-auto" onClick={(e) => e.stopPropagation()}>
                  Alle anzeigen
                </Link>
              }
            >
              {letzte.length === 0 ? (
                <p className="text-sm text-[#c4c2bf] py-2 text-center">Noch keine Bestellungen.</p>
              ) : (
                <div className="space-y-1">
                  {letzte.map((b) => {
                    const s = getStatusConfig(b.status);
                    return (
                      <Link key={b.id} href={`/bestellungen/${b.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-[#fafaf9] hover:shadow-sm transition-all group">
                        <div>
                          <p className="text-sm font-medium text-[#1a1a1a] group-hover:text-[#570006] transition-colors">
                            <span className="font-mono-amount">{b.bestellnummer || "Ohne Nr."}</span>
                            <span className="text-[#9a9a9a] font-normal"> – {b.haendler_name || "–"}</span>
                          </p>
                          <p className="text-[11px] text-[#c4c2bf]">{b.besteller_name} · {formatDatum(b.created_at)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {b.betrag && (
                            <span className="font-mono-amount text-sm font-semibold text-[#1a1a1a]">{formatBetrag(b.betrag, b.waehrung || "EUR")}</span>
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

      {/* Bestellungen pro Besteller */}
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {bestellerEntries.map(([kuerzel, count]) => (
                <div key={kuerzel} className="flex items-center gap-3 p-3 rounded-lg bg-[#fafaf9] border border-[#f0eeeb]">
                  <div className="w-9 h-9 rounded-lg bg-[#570006] text-white flex items-center justify-center text-[11px] font-bold">{kuerzel}</div>
                  <div>
                    <p className="font-mono-amount text-lg font-bold text-[#1a1a1a]">{count}</p>
                    <p className="text-[10px] text-[#9a9a9a] uppercase tracking-wide">Bestellungen</p>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleCard>
        </div>
      )}
    </div>
  );
}
