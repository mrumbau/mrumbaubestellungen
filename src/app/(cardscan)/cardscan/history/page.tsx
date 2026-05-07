"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BackLink } from "@/components/cardscan/BackLink";
import type { CardScanCapture, ExtractedContactData } from "@/lib/cardscan/types";

const STATUS_DOT: Record<string, string> = {
  pending: "bg-cs-pending",
  extracting: "bg-cs-extracting",
  review: "bg-cs-partial",
  writing: "bg-cs-writing",
  success: "bg-cs-success",
  partial_success: "bg-cs-partial",
  failed: "bg-cs-failed",
  discarded: "bg-cs-discarded",
};

const SOURCE_ICON: Record<string, string> = {
  text: "T",
  image: "F",
  url: "U",
  file: "D",
  clipboard: "C",
  share: "S",
};

function getDisplayName(data: ExtractedContactData | null): string {
  if (!data) return "Unbekannt";
  if (data.customer_type === "company" && data.companyName) return data.companyName;
  const name = [data.firstName, data.lastName].filter(Boolean).join(" ");
  return name || data.email || "Unbekannt";
}

function getSubtitle(data: ExtractedContactData | null): string {
  if (!data) return "";
  if (data.customer_type === "company" && data.companyName) {
    const person = [data.contactPerson?.firstName, data.contactPerson?.lastName].filter(Boolean).join(" ");
    return person || data.email || "";
  }
  return data.email || data.companyName || "";
}

function getTimeGroup(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return "Heute";
  if (diffDays === 1) return "Gestern";
  if (diffDays < 7) return "Diese Woche";
  if (diffDays < 30) return "Diesen Monat";
  return "Älter";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

type StatusFilter = "all" | "open" | "success" | "failed";

const PAGE_SIZE = 50;

function matchesStatusFilter(status: string, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "open") return ["pending", "extracting", "review"].includes(status);
  if (filter === "success") return ["success", "partial_success"].includes(status);
  if (filter === "failed") return ["failed", "discarded"].includes(status);
  return true;
}

function matchesSearch(c: CardScanCapture, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  const data = (c.extracted_data || c.final_data) as ExtractedContactData | null;
  if (!data) return false;
  const haystack = [
    data.companyName,
    data.firstName,
    data.lastName,
    data.email,
    data.phone,
    data.mobile,
    data.contactPerson?.firstName,
    data.contactPerson?.lastName,
    data.contactPerson?.email,
    data.address?.city,
    data.address?.zip,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(lower);
}

export default function CardScanHistoryPage() {
  const router = useRouter();
  const [captures, setCaptures] = useState<CardScanCapture[]>([]);
  const [loading, setLoading] = useState(true);
  // CU8: Search + Status-Filter + Load-More
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    // 500-Item-Hard-Cap analog Bestellwesen — Frontend-Filter danach
    fetch("/api/cardscan/captures?limit=500")
      .then((r) => r.json())
      .then((json) => setCaptures(json.data || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-lg md:max-w-xl mx-auto">
        <h1 className="font-headline text-xl text-foreground tracking-tight mb-6">
          Letzte Scans
        </h1>
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-4 flex items-center gap-3">
              <div className="skeleton w-10 h-10 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="skeleton-text w-3/4" />
                <div className="skeleton-text w-1/3 h-[0.75em]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // CU8: Filter + Suche + Pagination clientseitig (500-Hard-Cap)
  const filtered = captures.filter(
    (c) => matchesStatusFilter(c.status, statusFilter) && matchesSearch(c, search.trim())
  );
  const visible = filtered.slice(0, visibleCount);

  // Nach Zeitgruppen sortieren
  const groups: { label: string; items: CardScanCapture[] }[] = [];
  let currentGroup = "";

  for (const c of visible) {
    const group = getTimeGroup(c.created_at);
    if (group !== currentGroup) {
      currentGroup = group;
      groups.push({ label: group, items: [] });
    }
    groups[groups.length - 1].items.push(c);
  }

  const STATUS_TABS: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "Alle" },
    { key: "open", label: "Offen" },
    { key: "success", label: "Erfolg" },
    { key: "failed", label: "Fehler" },
  ];

  return (
    <div className="max-w-lg md:max-w-xl mx-auto animate-fade-in">
      <BackLink />
      <h1 className="font-headline text-xl text-foreground tracking-tight mb-4">
        Letzte Scans
      </h1>

      {captures.length > 0 && (
        <>
          {/* Suche */}
          <div className="card p-1 mb-3">
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="Suche nach Name, Firma, E-Mail …"
              className="w-full py-2.5 px-3 rounded-md bg-bg-card text-foreground text-base placeholder:text-foreground-tertiary focus:outline-none border-0"
              aria-label="Scans durchsuchen"
            />
          </div>

          {/* Status-Filter-Tabs */}
          <div className="flex gap-1.5 mb-4 overflow-x-auto -mx-1 px-1 pb-1">
            {STATUS_TABS.map((tab) => {
              const active = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setStatusFilter(tab.key);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-md transition-colors min-h-[36px] ${
                    active
                      ? "bg-cs-accent-tint text-cs-accent-text border border-cs-accent/30"
                      : "bg-input text-foreground-muted border border-line hover:bg-surface-hover"
                  }`}
                  aria-pressed={active}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Result-Count */}
          {(search || statusFilter !== "all") && (
            <p className="text-[11px] text-foreground-subtle mb-3 px-1">
              {filtered.length === 0
                ? "Keine Treffer"
                : `${filtered.length} ${filtered.length === 1 ? "Treffer" : "Treffer"}`}
            </p>
          )}
        </>
      )}

      {captures.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-sm text-foreground-subtle">Noch keine Scans vorhanden.</p>
          <button
            onClick={() => router.push("/cardscan")}
            className="mt-4 py-2.5 px-5 rounded-md bg-sidebar text-white text-sm font-medium min-h-[44px]"
          >
            Ersten Scan starten
          </button>
        </div>
      )}

      {captures.length > 0 && filtered.length === 0 && (
        <div className="card p-6 text-center">
          <p className="text-sm text-foreground-subtle">Keine Scans entsprechen deiner Suche.</p>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.label} className="mb-5">
          {/* Zeitgruppen-Header */}
          <p className="text-[10px] text-foreground-subtle uppercase tracking-[0.15em] font-mono-amount mb-2 px-1">
            {group.label}
          </p>

          <div className="space-y-1.5">
            {group.items.map((c) => {
              const data = (c.extracted_data || c.final_data) as ExtractedContactData | null;
              const name = getDisplayName(data);
              const subtitle = getSubtitle(data);
              const dot = STATUS_DOT[c.status] || STATUS_DOT.pending;
              const sourceChar = SOURCE_ICON[c.source_type] || "?";
              const isToday = getTimeGroup(c.created_at) === "Heute" || getTimeGroup(c.created_at) === "Gestern";

              return (
                <button
                  key={c.id}
                  onClick={() => {
                    if (c.status === "review") router.push(`/cardscan/review/${c.id}`);
                    else if (c.status !== "pending" && c.status !== "extracting" && c.status !== "writing") router.push(`/cardscan/history/${c.id}`);
                  }}
                  className="card w-full text-left p-3.5 flex items-center gap-3 hover:shadow-[var(--shadow-hover)] transition-shadow min-h-[56px]"
                >
                  {/* Initial mit Quell-Badge */}
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-xl bg-input flex items-center justify-center text-sm font-bold text-foreground-muted">
                      {(name || "?")[0]?.toUpperCase()}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ${dot} border-2 border-[var(--bg-card)]`} />
                  </div>

                  {/* Name + Subtitle */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{name}</p>
                    {subtitle && (
                      <p className="text-[11px] text-foreground-subtle truncate mt-0.5">{subtitle}</p>
                    )}
                  </div>

                  {/* Zeit */}
                  <span className="text-[10px] text-foreground-subtle font-mono-amount shrink-0">
                    {isToday ? formatTime(c.created_at) : formatDate(c.created_at)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {filtered.length > visibleCount && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
            className="py-2.5 px-5 rounded-md border border-line text-sm font-medium text-foreground-muted hover:bg-input transition-colors min-h-[44px]"
          >
            Weitere {Math.min(PAGE_SIZE, filtered.length - visibleCount)} laden
          </button>
        </div>
      )}
    </div>
  );
}
