"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatDatum, formatBetrag } from "@/lib/formatters";
import { DOKUMENT_CONFIG } from "@/lib/bestellung-utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAB_LABELS = {
  projekte: "Projekte",
  material: "Material",
  subunternehmer: "Subunternehmer",
} as const;

const EMPTY_MESSAGES = {
  projekte: "Keine abgeschlossenen Projekte gefunden.",
  material: "Keine bezahlten Material-Bestellungen gefunden.",
  subunternehmer: "Keine bezahlten Subunternehmer-Rechnungen gefunden.",
} as const;

const LIMIT_HINT = "Maximal 100 Eintr\u00e4ge geladen. \u00c4ltere Eintr\u00e4ge \u00fcber die Suche finden.";

const STAT_CARDS: readonly { key: string; label: string; color: string; isCurrency?: boolean }[] = [
  { key: "totalProjekte", label: "PROJEKTE", color: "#7c3aed" },
  { key: "totalMaterial", label: "MATERIAL", color: "#2563eb" },
  { key: "totalSU", label: "SUBUNTERNEHMER", color: "#d97706" },
  { key: "totalVolumen", label: "GESAMTVOLUMEN", color: "#570006", isCurrency: true },
];

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

  // All orders for project expansion
  const allOrders = useMemo(() => [...materialOrders, ...suOrders], [materialOrders, suOrders]);

  return (
    <div className="p-4 pt-16 md:p-8 md:pt-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="font-headline text-2xl text-[#1a1a1a] tracking-tight">Archiv</h1>
          <p className="text-[#9a9a9a] text-sm mt-1">Abgeschlossene Projekte und bezahlte Rechnungen</p>
        </div>
        <div className="text-right">
          <span className="font-mono-amount text-xs text-[#9a9a9a]">
            {summary.totalProjekte + summary.totalMaterial + summary.totalSU}
          </span>
          <br />
          <span className="text-[10px] text-[#c4c2bf] uppercase tracking-wide">Eintr&auml;ge</span>
        </div>
      </div>
      <div className="industrial-line" />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 mt-6">
        {STAT_CARDS.map((card) => {
          const value = summary[card.key as keyof typeof summary];
          return (
            <div
              key={card.key}
              className="card p-5"
              style={{ borderTop: `3px solid ${card.color}` }}
            >
              <p className="text-[10px] text-[#9a9a9a] uppercase tracking-wider font-semibold mb-2">
                {card.label}
              </p>
              <p className="font-mono-amount text-2xl text-[#1a1a1a]">
                {card.isCurrency ? formatBetrag(value) : value}
              </p>
            </div>
          );
        })}
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
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
            className="w-full pl-10 pr-3 py-2.5 bg-white border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] placeholder-[#c4c2bf] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-[#9a9a9a] uppercase tracking-wide">Von</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2.5 bg-white border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-[#9a9a9a] uppercase tracking-wide">Bis</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2.5 bg-white border border-[#e8e6e3] rounded-lg text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#570006]/15 focus:border-[#570006]/30 transition-colors"
            />
          </div>
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-[#570006] text-sm hover:underline whitespace-nowrap self-center"
          >
            Zur\u00fccksetzen
          </button>
        )}
      </div>

      {/* Tab Selector */}
      <div className="flex border-b border-[#e8e6e3] mb-6">
        {(["projekte", "material", "subunternehmer"] as TabKey[]).map((tab) => {
          const count =
            tab === "projekte"
              ? filteredProjekte.length
              : tab === "material"
                ? filteredMaterial.length
                : filteredSU.length;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm transition-colors border-b-2 ${
                activeTab === tab
                  ? "text-[#570006] border-[#570006] font-semibold"
                  : "text-[#9a9a9a] hover:text-[#6b6b6b] border-transparent"
              }`}
            >
              {TAB_LABELS[tab]} ({count})
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
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
  if (projekte.length === 0) {
    return (
      <div className="card p-12 text-center">
        <p className="text-[#9a9a9a]">{EMPTY_MESSAGES.projekte}</p>
      </div>
    );
  }

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
            className="card p-5"
            style={{ borderLeft: `4px solid ${p.farbe || "#9a9a9a"}` }}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-headline text-base text-[#1a1a1a] leading-tight">{p.name}</h3>
              <span className="bg-red-50 text-red-600 text-[10px] px-2 py-0.5 rounded font-medium whitespace-nowrap ml-2">
                Abgeschlossen
              </span>
            </div>

            {/* Description */}
            {p.beschreibung && (
              <p className="text-xs text-[#6b6b6b] line-clamp-2 mb-3">{p.beschreibung}</p>
            )}

            {/* Stats */}
            <div className="flex items-center gap-4 mb-2">
              {stats ? (
                <>
                  <span className="text-xs text-[#6b6b6b]">
                    {stats.count} Bestellung{stats.count !== 1 ? "en" : ""}
                  </span>
                  <span className="font-mono-amount text-sm font-semibold text-[#1a1a1a]">
                    {formatBetrag(stats.volumen)}
                  </span>
                </>
              ) : (
                <span className="text-xs text-[#9a9a9a]">Keine bezahlten Bestellungen</span>
              )}
            </div>

            {/* Budget bar */}
            {budgetPercent !== null && p.budget && (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-[#9a9a9a] uppercase tracking-wide">Budget</span>
                  <span className="font-mono-amount text-[10px] text-[#6b6b6b]">
                    {budgetPercent}% von {formatBetrag(p.budget)}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[#f0eeeb] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, budgetPercent)}%`,
                      backgroundColor:
                        budgetPercent > 100 ? "#dc2626" : budgetPercent > 80 ? "#d97706" : "#16a34a",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Date */}
            <p className="text-[10px] text-[#c4c2bf] mb-3">{formatDatum(p.created_at)}</p>

            {/* Expand toggle */}
            {projektOrders.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => toggleExpand(p.id)}
                  className="flex items-center gap-1.5 text-xs text-[#570006] hover:text-[#7a1a1f] transition-colors"
                >
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                  Bestellungen anzeigen ({projektOrders.length})
                </button>

                {isExpanded && (
                  <div className="bg-[#fafaf9] rounded-lg p-3 mt-3 space-y-0">
                    {projektOrders.map((o, i) => (
                      <Link
                        key={o.id}
                        href={`/bestellungen/${o.id}`}
                        className={`flex items-center justify-between py-2 hover:bg-[#f0eeeb] px-2 rounded transition-colors ${
                          i < projektOrders.length - 1 ? "border-b border-[#f0eeeb]" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{
                              backgroundColor: o.bestellungsart === "subunternehmer" ? "#d97706" : "#2563eb",
                            }}
                          />
                          <span className="font-mono-amount text-xs">{o.bestellnummer || "Ohne Nr."}</span>
                          <span className="text-xs text-[#6b6b6b]">{o.haendler_name || o.subunternehmer_firma || ""}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono-amount text-xs font-medium">{formatBetrag(Number(o.betrag))}</span>
                          <span className="text-[10px] text-[#9a9a9a]">{formatDatum(o.bezahlt_am)}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
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
  const dotColor = type === "material" ? "#2563eb" : "#d97706";
  const dokConfig = DOKUMENT_CONFIG[type];

  if (orders.length === 0) {
    return (
      <div className="card p-12 text-center">
        <p className="text-[#9a9a9a]">{EMPTY_MESSAGES[type]}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {monthGroups.map((group) => (
        <div key={group.key}>
          {/* Month header */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#9a9a9a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              <span className="font-headline text-sm text-[#6b6b6b]">{group.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-[#c4c2bf]">{group.items.length} Eintr&auml;ge</span>
              <span className="font-mono-amount text-xs text-[#9a9a9a]">{formatBetrag(group.subtotal)}</span>
            </div>
          </div>
          <div className="h-px bg-gradient-to-r from-[#570006]/20 via-[#570006]/10 to-transparent mb-4" />

          {/* Order cards */}
          <div className="space-y-3">
            {group.items.map((order) => {
              const isExpanded = expandedIds.has(order.id);
              const docs = dokumenteMap[order.id] || [];

              return (
                <div key={order.id} className="card card-hover p-4">
                  <div className="flex items-center gap-4">
                    {/* Dot */}
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono-amount text-sm font-semibold text-[#1a1a1a]">
                          {order.bestellnummer || "Ohne Nr."}
                        </span>
                        <span className="text-sm text-[#6b6b6b]">
                          {type === "subunternehmer"
                            ? order.subunternehmer_firma || order.haendler_name || ""
                            : order.haendler_name || ""}
                        </span>
                        {type === "subunternehmer" && order.subunternehmer_gewerk && (
                          <span className="inline-flex items-center px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] uppercase tracking-wider rounded font-semibold">
                            {order.subunternehmer_gewerk}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {order.projekt_name && (
                          <span className="text-[11px] text-[#9a9a9a]">{order.projekt_name}</span>
                        )}
                        {istAdmin && (
                          <span className="text-[11px] text-[#c4c2bf]">{order.besteller_name}</span>
                        )}
                      </div>
                    </div>

                    {/* Document indicators */}
                    <div className="hidden sm:flex items-center gap-1.5">
                      {dokConfig.map((dok) => {
                        const hasDoc = order[dok.flag as keyof PaidBestellung] as boolean;
                        return (
                          <div
                            key={dok.flag}
                            className="flex items-center gap-0.5"
                            title={dok.label}
                          >
                            {hasDoc ? (
                              <svg className="w-3.5 h-3.5 text-[#16a34a]" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full border border-[#e8e6e3]" />
                            )}
                            <span className="text-[9px] text-[#c4c2bf]">{dok.kurzLabel}</span>
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

                    {/* Expand button */}
                    <button
                      type="button"
                      onClick={() => toggleExpand(order.id)}
                      className="p-1 text-[#9a9a9a] hover:text-[#570006] transition-colors shrink-0"
                    >
                      <svg
                        className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="bg-[#fafaf9] rounded-lg p-3 mt-3">
                      {docs.length > 0 ? (
                        <div className="space-y-2">
                          {docs.map((dok) => (
                            <div key={dok.id} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <svg className="w-3.5 h-3.5 text-[#9a9a9a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                </svg>
                                <span className="capitalize text-[#6b6b6b]">{dok.typ}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                {dok.gesamtbetrag != null && (
                                  <span className="font-mono-amount text-[#9a9a9a]">
                                    {formatBetrag(dok.gesamtbetrag)}
                                  </span>
                                )}
                                <span className="text-[#c4c2bf]">{formatDatum(dok.created_at)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-[#c4c2bf]">Keine Dokumente vorhanden</p>
                      )}
                      <div className="mt-3 pt-2 border-t border-[#f0eeeb] flex items-center justify-between">
                        <Link
                          href={`/bestellungen/${order.id}`}
                          className="text-xs text-[#570006] hover:text-[#7a1a1f] hover:underline transition-colors"
                        >
                          Details anzeigen &rarr;
                        </Link>
                        {order.bezahlt_von && (
                          <span className="text-[10px] text-[#c4c2bf]">
                            Bezahlt von {order.bezahlt_von}
                          </span>
                        )}
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
        <p className="text-[#9a9a9a] text-sm text-center py-4">{LIMIT_HINT}</p>
      )}
    </div>
  );
}

