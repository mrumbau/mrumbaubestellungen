"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatDatum, formatBetrag } from "@/lib/formatters";
import { DOKUMENT_CONFIG } from "@/lib/bestellung-utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAB_CONFIG: readonly { key: TabKey; label: string; color: string; icon: string }[] = [
  { key: "projekte", label: "Projekte", color: "#7c3aed", icon: "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" },
  { key: "material", label: "Material", color: "#2563eb", icon: "M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" },
  { key: "subunternehmer", label: "Subunternehmer", color: "#d97706", icon: "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" },
];

const STAT_CARDS: readonly { key: string; label: string; color: string; isCurrency?: boolean }[] = [
  { key: "totalProjekte", label: "PROJEKTE", color: "#7c3aed" },
  { key: "totalMaterial", label: "MATERIAL", color: "#2563eb" },
  { key: "totalSU", label: "SUBUNTERNEHMER", color: "#d97706" },
  { key: "totalVolumen", label: "GESAMTVOLUMEN", color: "#570006", isCurrency: true },
];

const EMPTY_ICONS = {
  projekte: "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21",
  material: "M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z",
  subunternehmer: "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z",
};

const EMPTY_MESSAGES = {
  projekte: { title: "Keine abgeschlossenen Projekte", subtitle: "Projekte mit Status \"Abgeschlossen\" erscheinen hier automatisch." },
  material: { title: "Keine bezahlten Material-Bestellungen", subtitle: "Bezahlte Material-Rechnungen werden hier archiviert." },
  subunternehmer: { title: "Keine bezahlten SU-Rechnungen", subtitle: "Bezahlte Subunternehmer-Rechnungen werden hier archiviert." },
} as const;

const LIMIT_HINT = "Maximal 100 Eintr\u00e4ge geladen. \u00c4ltere Eintr\u00e4ge \u00fcber die Suche finden.";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ArchivedProjekt {
  id: string;
  name: string;
  beschreibung: string | null;
  farbe: string;
  budget: number | null;
  status: string;
  created_at: string;
}

interface PaidBestellung {
  id: string;
  bestellnummer: string | null;
  haendler_name: string | null;
  besteller_kuerzel: string;
  besteller_name: string;
  betrag: number | null;
  bezahlt_am: string;
  bezahlt_von: string | null;
  bestellungsart: string;
  projekt_id: string | null;
  projekt_name: string | null;
  hat_bestellbestaetigung: boolean;
  hat_lieferschein: boolean;
  hat_rechnung: boolean;
  hat_aufmass?: boolean;
  hat_leistungsnachweis?: boolean;
  subunternehmer_gewerk?: string | null;
  subunternehmer_firma?: string | null;
  subunternehmer_id?: string | null;
}

interface Dokument {
  id: string;
  bestellung_id: string;
  typ: string;
  storage_pfad: string | null;
  gesamtbetrag: number | null;
  created_at: string;
}

interface ProjektStats {
  count: number;
  volumen: number;
}

interface MonthGroup {
  key: string;
  label: string;
  items: PaidBestellung[];
  subtotal: number;
}

type TabKey = "projekte" | "material" | "subunternehmer";

interface ArchivClientProps {
  projekte: ArchivedProjekt[];
  materialOrders: PaidBestellung[];
  suOrders: PaidBestellung[];
  dokumenteMap: Record<string, Dokument[]>;
  projektStats: Record<string, ProjektStats>;
  summary: {
    totalProjekte: number;
    totalMaterial: number;
    totalSU: number;
    totalVolumen: number;
  };
  istAdmin: boolean;
  limitReached: { material: boolean; su: boolean };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByMonth(items: PaidBestellung[], dateField: keyof PaidBestellung): MonthGroup[] {
  const groups = new Map<string, { items: PaidBestellung[]; subtotal: number }>();

  for (const item of items) {
    const dateVal = item[dateField];
    if (!dateVal || typeof dateVal !== "string") continue;
    const d = new Date(dateVal);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(key)) {
      groups.set(key, { items: [], subtotal: 0 });
    }
    const g = groups.get(key)!;
    g.items.push(item);
    g.subtotal += Number(item.betrag) || 0;
  }

  return Array.from(groups.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, { items: monthItems, subtotal }]) => {
      const [year, month] = key.split("-");
      const d = new Date(Number(year), Number(month) - 1);
      const label = d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
      return { key, label: label.charAt(0).toUpperCase() + label.slice(1), items: monthItems, subtotal };
    });
}

function matchesSearchOrder(item: PaidBestellung, query: string): boolean {
  const q = query.toLowerCase();
  return (
    (item.bestellnummer || "").toLowerCase().includes(q) ||
    (item.haendler_name || "").toLowerCase().includes(q) ||
    (item.besteller_name || "").toLowerCase().includes(q) ||
    (item.projekt_name || "").toLowerCase().includes(q) ||
    (item.subunternehmer_firma || "").toLowerCase().includes(q) ||
    (item.subunternehmer_gewerk || "").toLowerCase().includes(q)
  );
}

function matchesSearchProjekt(item: ArchivedProjekt, query: string): boolean {
  const q = query.toLowerCase();
  return (
    item.name.toLowerCase().includes(q) ||
    (item.beschreibung || "").toLowerCase().includes(q)
  );
}

function inDateRange(dateStr: string | null, from: string, to: string): boolean {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ArchivClient({
  projekte,
  materialOrders,
  suOrders,
  dokumenteMap,
  projektStats,
  summary,
  istAdmin,
  limitReached,
}: ArchivClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("projekte");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasFilters = searchQuery || dateFrom || dateTo;

  const resetFilters = () => {
    setSearchQuery("");
    setDateFrom("");
    setDateTo("");
  };

  // Filtered data
  const filteredProjekte = useMemo(() => {
    return projekte.filter((p) => {
      if (searchQuery && !matchesSearchProjekt(p, searchQuery)) return false;
      if ((dateFrom || dateTo) && !inDateRange(p.created_at, dateFrom, dateTo)) return false;
      return true;
    });
  }, [projekte, searchQuery, dateFrom, dateTo]);

  const filteredMaterial = useMemo(() => {
    return materialOrders.filter((o) => {
      if (searchQuery && !matchesSearchOrder(o, searchQuery)) return false;
      if ((dateFrom || dateTo) && !inDateRange(o.bezahlt_am, dateFrom, dateTo)) return false;
      return true;
    });
  }, [materialOrders, searchQuery, dateFrom, dateTo]);

  const filteredSU = useMemo(() => {
    return suOrders.filter((o) => {
      if (searchQuery && !matchesSearchOrder(o, searchQuery)) return false;
      if ((dateFrom || dateTo) && !inDateRange(o.bezahlt_am, dateFrom, dateTo)) return false;
      return true;
    });
  }, [suOrders, searchQuery, dateFrom, dateTo]);

  const allOrders = useMemo(() => [...materialOrders, ...suOrders], [materialOrders, suOrders]);

  const tabCounts: Record<TabKey, number> = {
    projekte: filteredProjekte.length,
    material: filteredMaterial.length,
    subunternehmer: filteredSU.length,
  };

  return (
    <div className="p-4 pt-16 md:p-8 md:pt-8 max-w-[1400px]">
      {/* ─── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-headline text-2xl text-[#1a1a1a] tracking-tight">Archiv</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#fafaf9] border border-[#e8e6e3] rounded-full">
              <svg className="w-3 h-3 text-[#9a9a9a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
              <span className="font-mono-amount text-[11px] text-[#6b6b6b]">
                {summary.totalProjekte + summary.totalMaterial + summary.totalSU}
              </span>
            </span>
          </div>
          <p className="text-[#9a9a9a] text-sm mt-1">Abgeschlossene Projekte und bezahlte Rechnungen</p>
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#570006] bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Filter zur\u00fccksetzen
          </button>
        )}
      </div>
      <div className="industrial-line" />

      {/* ─── Summary Stats ───────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 mt-6">
        {STAT_CARDS.map((card) => {
          const value = summary[card.key as keyof typeof summary];
          return (
            <div
              key={card.key}
              className="card p-5 relative overflow-hidden group"
              style={{ borderTop: `3px solid ${card.color}` }}
            >
              {/* Gradient overlay like buchhaltung/dashboard */}
              <div
                className="absolute inset-0 opacity-[0.04] pointer-events-none"
                style={{ background: `linear-gradient(180deg, ${card.color}, transparent)` }}
              />
              <p className="text-[10px] text-[#9a9a9a] uppercase tracking-wider font-semibold mb-2 relative">
                {card.label}
              </p>
              <p className="font-mono-amount text-2xl text-[#1a1a1a] relative">
                {card.isCurrency ? formatBetrag(value) : value}
              </p>
            </div>
          );
        })}
      </div>

      {/* ─── Search & Date Filter ────────────────────────────── */}
      <div className="card p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#c4c2bf]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Projekt, Bestellnummer, H\u00e4ndler, Firma..."
              className="w-full pl-10 pr-3 py-2.5 bg-[#fafaf9] border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] placeholder-[#c4c2bf] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 focus:bg-white transition-all"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-[#9a9a9a] uppercase tracking-wider font-semibold">Von</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-2.5 bg-[#fafaf9] border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 focus:bg-white transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-[#9a9a9a] uppercase tracking-wider font-semibold">Bis</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-2.5 bg-[#fafaf9] border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 focus:bg-white transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Tab Selector ────────────────────────────────────── */}
      <div className="flex gap-1 bg-[#fafaf9] p-1 rounded-xl border border-[#e8e6e3] mb-6">
        {TAB_CONFIG.map((tab) => {
          const isActive = activeTab === tab.key;
          const count = tabCounts[tab.key];
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-all ${
                isActive
                  ? "bg-white text-[#1a1a1a] font-semibold shadow-sm border border-[#e8e6e3]"
                  : "text-[#9a9a9a] hover:text-[#6b6b6b] hover:bg-white/50"
              }`}
            >
              <svg className={`w-4 h-4 hidden sm:block ${isActive ? "text-[#570006]" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
              </svg>
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden text-xs">{tab.label}</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                  isActive
                    ? "bg-[#570006] text-white"
                    : "bg-[#e8e6e3] text-[#6b6b6b]"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ─── Tab Content ─────────────────────────────────────── */}
      {activeTab === "projekte" && (
        <ProjekteTab
          projekte={filteredProjekte}
          projektStats={projektStats}
          allOrders={allOrders}
          expandedIds={expandedIds}
          toggleExpand={toggleExpand}
        />
      )}

      {activeTab === "material" && (
        <OrdersTab
          orders={filteredMaterial}
          dokumenteMap={dokumenteMap}
          expandedIds={expandedIds}
          toggleExpand={toggleExpand}
          type="material"
          limitReached={limitReached.material}
          istAdmin={istAdmin}
        />
      )}

      {activeTab === "subunternehmer" && (
        <OrdersTab
          orders={filteredSU}
          dokumenteMap={dokumenteMap}
          expandedIds={expandedIds}
          toggleExpand={toggleExpand}
          type="subunternehmer"
          limitReached={limitReached.su}
          istAdmin={istAdmin}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState({ type }: { type: TabKey }) {
  const msg = EMPTY_MESSAGES[type];
  const iconPath = EMPTY_ICONS[type];
  return (
    <div className="card p-16 text-center relative overflow-hidden">
      <div className="absolute inset-0 bg-dot-grid opacity-40 pointer-events-none" />
      <div className="relative">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#fafaf9] border border-[#e8e6e3] flex items-center justify-center">
          <svg className="w-7 h-7 text-[#c4c2bf]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
          </svg>
        </div>
        <p className="text-[#6b6b6b] font-medium mb-1">{msg.title}</p>
        <p className="text-[#9a9a9a] text-sm">{msg.subtitle}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Projekte Tab
// ---------------------------------------------------------------------------

function ProjekteTab({
  projekte,
  projektStats,
  allOrders,
  expandedIds,
  toggleExpand,
}: {
  projekte: ArchivedProjekt[];
  projektStats: Record<string, ProjektStats>;
  allOrders: PaidBestellung[];
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
}) {
  if (projekte.length === 0) return <EmptyState type="projekte" />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {projekte.map((p) => {
        const stats = projektStats[p.id];
        const isExpanded = expandedIds.has(p.id);
        const projektOrders = allOrders.filter((o) => o.projekt_id === p.id);
        const budgetPercent =
          p.budget && stats ? Math.round((stats.volumen / p.budget) * 100) : null;

        return (
          <div
            key={p.id}
            className="card card-hover relative overflow-hidden"
            style={{ borderLeft: `4px solid ${p.farbe || "#9a9a9a"}` }}
          >
            {/* Subtle project-color gradient */}
            <div
              className="absolute top-0 left-0 right-0 h-24 opacity-[0.03] pointer-events-none"
              style={{ background: `linear-gradient(180deg, ${p.farbe || "#9a9a9a"}, transparent)` }}
            />

            <div className="p-5 relative">
              {/* Header */}
              <div className="flex items-start justify-between mb-1.5">
                <h3 className="font-headline text-base text-[#1a1a1a] leading-tight pr-2">{p.name}</h3>
                <span className="inline-flex items-center gap-1 bg-[#fafaf9] border border-[#e8e6e3] text-[#6b6b6b] text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                  <svg className="w-2.5 h-2.5 text-[#16a34a]" fill="currentColor" viewBox="0 0 8 8">
                    <circle cx="4" cy="4" r="4" />
                  </svg>
                  Abgeschlossen
                </span>
              </div>

              {/* Description */}
              {p.beschreibung && (
                <p className="text-xs text-[#6b6b6b] line-clamp-2 mb-3">{p.beschreibung}</p>
              )}

              {/* Stats row */}
              <div className="flex items-center gap-3 mb-3">
                {stats ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-[#9a9a9a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <span className="text-xs text-[#6b6b6b]">
                        {stats.count} Bestellung{stats.count !== 1 ? "en" : ""}
                      </span>
                    </div>
                    <div className="h-3 w-px bg-[#e8e6e3]" />
                    <span className="font-mono-amount text-sm font-semibold text-[#1a1a1a]">
                      {formatBetrag(stats.volumen)}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-[#c4c2bf] italic">Keine bezahlten Bestellungen</span>
                )}
              </div>

              {/* Budget bar */}
              {budgetPercent !== null && p.budget && (
                <div className="mb-3 p-2.5 bg-[#fafaf9] rounded-lg border border-[#f0eeeb]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-[#9a9a9a] uppercase tracking-wider font-semibold">Budget</span>
                    <span className={`font-mono-amount text-[11px] font-medium ${
                      budgetPercent > 100 ? "text-[#dc2626]" : budgetPercent > 80 ? "text-[#d97706]" : "text-[#6b6b6b]"
                    }`}>
                      {budgetPercent}% von {formatBetrag(p.budget)}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-[#e8e6e3] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.min(100, budgetPercent)}%`,
                        backgroundColor:
                          budgetPercent > 100 ? "#dc2626" : budgetPercent > 80 ? "#d97706" : "#16a34a",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Footer: Date + Expand */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#c4c2bf]">Erstellt {formatDatum(p.created_at)}</span>
                {projektOrders.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleExpand(p.id)}
                    className="flex items-center gap-1 text-xs text-[#570006] hover:text-[#7a1a1f] font-medium transition-colors"
                  >
                    <svg
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                    {isExpanded ? "Ausblenden" : `${projektOrders.length} Bestellung${projektOrders.length !== 1 ? "en" : ""}`}
                  </button>
                )}
              </div>

              {/* Expanded orders */}
              {isExpanded && projektOrders.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[#f0eeeb]">
                  <div className="space-y-0">
                    {projektOrders.map((o, i) => (
                      <Link
                        key={o.id}
                        href={`/bestellungen/${o.id}`}
                        className={`group/row flex items-center justify-between py-2.5 px-2.5 -mx-0.5 rounded-lg hover:bg-[#f0eeeb]/60 transition-all ${
                          i < projektOrders.length - 1 ? "border-b border-[#f5f4f2]" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-2 h-2 rounded-full shrink-0 ring-2 ring-offset-1 ${
                              o.bestellungsart === "subunternehmer"
                                ? "bg-[#d97706] ring-amber-200"
                                : "bg-[#2563eb] ring-blue-200"
                            }`}
                          />
                          <span className="font-mono-amount text-xs font-semibold text-[#1a1a1a] group-hover/row:text-[#570006] transition-colors">
                            {o.bestellnummer || "Ohne Nr."}
                          </span>
                          <span className="text-xs text-[#6b6b6b] truncate">{o.haendler_name || o.subunternehmer_firma || ""}</span>
                          {o.bestellungsart === "subunternehmer" && (
                            <span className="hidden sm:inline px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-amber-50 text-amber-700 rounded">SU</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono-amount text-xs font-medium text-[#1a1a1a]">{formatBetrag(Number(o.betrag))}</span>
                          <span className="text-[10px] text-[#c4c2bf] hidden sm:inline">{formatDatum(o.bezahlt_am)}</span>
                          <svg className="w-3 h-3 text-[#c4c2bf] group-hover/row:text-[#570006] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Orders Tab (Material + SU)
// ---------------------------------------------------------------------------

function OrdersTab({
  orders,
  dokumenteMap,
  expandedIds,
  toggleExpand,
  type,
  limitReached,
  istAdmin,
}: {
  orders: PaidBestellung[];
  dokumenteMap: Record<string, Dokument[]>;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  type: "material" | "subunternehmer";
  limitReached: boolean;
  istAdmin: boolean;
}) {
  const monthGroups = useMemo(() => groupByMonth(orders, "bezahlt_am"), [orders]);
  const accentColor = type === "material" ? "#2563eb" : "#d97706";
  const dokConfig = DOKUMENT_CONFIG[type];

  if (orders.length === 0) return <EmptyState type={type} />;

  return (
    <div className="space-y-8">
      {monthGroups.map((group) => (
        <div key={group.key}>
          {/* Month header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#fafaf9] border border-[#e8e6e3] flex items-center justify-center">
                <svg className="w-4 h-4 text-[#6b6b6b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
              </div>
              <div>
                <h3 className="font-headline text-sm text-[#1a1a1a]">{group.label}</h3>
                <span className="text-[10px] text-[#c4c2bf]">{group.items.length} Eintr\u00e4ge</span>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono-amount text-sm font-semibold text-[#1a1a1a]">{formatBetrag(group.subtotal)}</p>
              <span className="text-[10px] text-[#c4c2bf] uppercase tracking-wide">Summe</span>
            </div>
          </div>
          <div className="h-px bg-gradient-to-r from-[#570006]/20 via-[#570006]/10 to-transparent mb-4" />

          {/* Order cards */}
          <div className="space-y-2">
            {group.items.map((order) => {
              const isExpanded = expandedIds.has(order.id);
              const docs = dokumenteMap[order.id] || [];

              return (
                <div
                  key={order.id}
                  className="card card-hover relative overflow-hidden"
                  style={{ borderLeft: `3px solid ${accentColor}` }}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpand(order.id)}
                    className="w-full p-4 text-left"
                  >
                    <div className="flex items-center gap-4">
                      {/* Type indicator */}
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${accentColor}10` }}
                      >
                        <span
                          className="font-mono-amount text-[11px] font-bold"
                          style={{ color: accentColor }}
                        >
                          {type === "material" ? "MAT" : "SU"}
                        </span>
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono-amount text-sm font-semibold text-[#1a1a1a]">
                            {order.bestellnummer || "Ohne Nr."}
                          </span>
                          <span className="text-sm text-[#6b6b6b] truncate">
                            {type === "subunternehmer"
                              ? order.subunternehmer_firma || order.haendler_name || ""
                              : order.haendler_name || ""}
                          </span>
                          {type === "subunternehmer" && order.subunternehmer_gewerk && (
                            <span className="inline-flex items-center px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] uppercase tracking-wider rounded font-semibold border border-amber-100">
                              {order.subunternehmer_gewerk}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {order.projekt_name && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-[#9a9a9a]">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
                              </svg>
                              {order.projekt_name}
                            </span>
                          )}
                          {istAdmin && order.besteller_name && (
                            <>
                              {order.projekt_name && <span className="text-[#e8e6e3]">&middot;</span>}
                              <span className="text-[11px] text-[#c4c2bf]">{order.besteller_name}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Document indicators */}
                      <div className="hidden sm:flex items-center gap-2">
                        {dokConfig.map((dok) => {
                          const hasDoc = order[dok.flag as keyof PaidBestellung] as boolean;
                          return (
                            <div
                              key={dok.flag}
                              className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
                                hasDoc ? "bg-green-50 border border-green-100" : "bg-[#fafaf9] border border-[#f0eeeb]"
                              }`}
                              title={dok.label}
                            >
                              {hasDoc ? (
                                <svg className="w-3 h-3 text-[#16a34a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                              ) : (
                                <svg className="w-3 h-3 text-[#d4d1cc]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                              )}
                              <span className={`text-[9px] font-semibold uppercase tracking-wide ${
                                hasDoc ? "text-[#16a34a]" : "text-[#c4c2bf]"
                              }`}>{dok.kurzLabel}</span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Amount + Date */}
                      <div className="text-right shrink-0">
                        <p className="font-mono-amount text-base font-semibold text-[#1a1a1a]">
                          {formatBetrag(Number(order.betrag))}
                        </p>
                        <p className="text-[10px] text-[#9a9a9a]">{formatDatum(order.bezahlt_am)}</p>
                      </div>

                      {/* Chevron */}
                      <svg
                        className={`w-4 h-4 text-[#c4c2bf] transition-transform duration-200 shrink-0 ${isExpanded ? "rotate-180" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t border-[#f0eeeb]">
                      <div className="p-4 bg-[#fafaf9]/50">
                        {/* Document list */}
                        {docs.length > 0 ? (
                          <div className="space-y-0">
                            <p className="text-[10px] text-[#9a9a9a] uppercase tracking-wider font-semibold mb-2">Dokumente</p>
                            {docs.map((dok, i) => (
                              <div
                                key={dok.id}
                                className={`flex items-center justify-between py-2.5 ${
                                  i < docs.length - 1 ? "border-b border-[#f0eeeb]" : ""
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className="w-7 h-7 rounded-md bg-white border border-[#e8e6e3] flex items-center justify-center">
                                    <svg className="w-3.5 h-3.5 text-[#9a9a9a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                    </svg>
                                  </div>
                                  <div>
                                    <span className="text-xs font-medium text-[#1a1a1a] capitalize">{dok.typ}</span>
                                    {dok.storage_pfad && (
                                      <span className="text-[10px] text-[#c4c2bf] ml-2">PDF</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  {dok.gesamtbetrag != null && (
                                    <span className="font-mono-amount text-xs font-medium text-[#6b6b6b]">
                                      {formatBetrag(dok.gesamtbetrag)}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-[#c4c2bf]">{formatDatum(dok.created_at)}</span>
                                  {dok.storage_pfad && (
                                    <a
                                      href={`/api/pdfs/${dok.id}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="p-1 rounded hover:bg-[#f0eeeb] text-[#9a9a9a] hover:text-[#570006] transition-colors"
                                      title="PDF ansehen"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                      </svg>
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 py-2 text-xs text-[#c4c2bf]">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                            </svg>
                            Keine Dokumente vorhanden
                          </div>
                        )}

                        {/* Footer */}
                        <div className="mt-3 pt-3 border-t border-[#f0eeeb] flex items-center justify-between">
                          <Link
                            href={`/bestellungen/${order.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 text-xs text-[#570006] hover:text-[#7a1a1f] font-medium transition-colors group/link"
                          >
                            Details anzeigen
                            <svg className="w-3 h-3 transition-transform group-hover/link:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                            </svg>
                          </Link>
                          {order.bezahlt_von && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-[#c4c2bf]">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                              </svg>
                              Bezahlt von {order.bezahlt_von}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Limit hint */}
      {limitReached && (
        <div className="card p-4 text-center border-dashed">
          <div className="flex items-center justify-center gap-2 text-[#9a9a9a] text-sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            {LIMIT_HINT}
          </div>
        </div>
      )}
    </div>
  );
}
