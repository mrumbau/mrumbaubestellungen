"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BackLink } from "@/components/cardscan/BackLink";
import type { CardScanCapture, ExtractedContactData } from "@/lib/cardscan/types";

const STATUS_DOT: Record<string, string> = {
  pending: "bg-slate-400",
  extracting: "bg-blue-400",
  review: "bg-amber-400",
  writing: "bg-blue-400",
  success: "bg-emerald-500",
  partial_success: "bg-amber-500",
  failed: "bg-red-500",
  discarded: "bg-slate-300",
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

export default function CardScanHistoryPage() {
  const router = useRouter();
  const [captures, setCaptures] = useState<CardScanCapture[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/cardscan/captures?limit=30")
      .then((r) => r.json())
      .then((json) => setCaptures(json.data || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-lg mx-auto">
        <h1 className="font-headline text-xl text-[var(--text-primary)] tracking-tight mb-6">
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

  // Nach Zeitgruppen sortieren
  const groups: { label: string; items: CardScanCapture[] }[] = [];
  let currentGroup = "";

  for (const c of captures) {
    const group = getTimeGroup(c.created_at);
    if (group !== currentGroup) {
      currentGroup = group;
      groups.push({ label: group, items: [] });
    }
    groups[groups.length - 1].items.push(c);
  }

  return (
    <div className="max-w-lg mx-auto animate-fade-in">
      <BackLink />
      <h1 className="font-headline text-xl text-[var(--text-primary)] tracking-tight mb-5">
        Letzte Scans
      </h1>

      {captures.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-sm text-[var(--text-tertiary)]">Noch keine Scans vorhanden.</p>
          <button
            onClick={() => router.push("/cardscan")}
            className="mt-4 py-2.5 px-5 rounded-[var(--radius-md)] bg-[var(--bg-sidebar)] text-white text-sm font-medium min-h-[44px]"
          >
            Ersten Scan starten
          </button>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.label} className="mb-5">
          {/* Zeitgruppen-Header */}
          <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.15em] font-mono-amount mb-2 px-1">
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
                    <div className="w-10 h-10 rounded-xl bg-[var(--bg-input)] flex items-center justify-center text-sm font-bold text-[var(--text-secondary)]">
                      {(name || "?")[0]?.toUpperCase()}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ${dot} border-2 border-[var(--bg-card)]`} />
                  </div>

                  {/* Name + Subtitle */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{name}</p>
                    {subtitle && (
                      <p className="text-[11px] text-[var(--text-tertiary)] truncate mt-0.5">{subtitle}</p>
                    )}
                  </div>

                  {/* Zeit */}
                  <span className="text-[10px] text-[var(--text-tertiary)] font-mono-amount shrink-0">
                    {isToday ? formatTime(c.created_at) : formatDate(c.created_at)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
