"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CardScanCapture, ExtractedContactData } from "@/lib/cardscan/types";

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  pending: { label: "Ausstehend", bg: "bg-slate-50", text: "text-slate-600" },
  extracting: { label: "Analysiert…", bg: "bg-blue-50", text: "text-blue-600" },
  review: { label: "Prüfung", bg: "bg-amber-50", text: "text-amber-700" },
  writing: { label: "Wird angelegt…", bg: "bg-blue-50", text: "text-blue-600" },
  success: { label: "Erstellt", bg: "bg-emerald-50", text: "text-emerald-700" },
  partial_success: { label: "Teilweise", bg: "bg-amber-50", text: "text-amber-700" },
  failed: { label: "Fehler", bg: "bg-red-50", text: "text-red-700" },
  discarded: { label: "Verworfen", bg: "bg-slate-50", text: "text-slate-500" },
};

const SOURCE_LABELS: Record<string, string> = {
  text: "Text",
  image: "Foto",
  url: "URL",
  file: "Datei",
  clipboard: "Clipboard",
  share: "Geteilt",
};

function getDisplayName(data: ExtractedContactData | null): string {
  if (!data) return "Unbekannt";
  if (data.customer_type === "company" && data.companyName) return data.companyName;
  const name = [data.firstName, data.lastName].filter(Boolean).join(" ");
  return name || data.email || "Unbekannt";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
      <div className="max-w-xl mx-auto">
        <h1 className="font-headline text-2xl text-[var(--text-primary)] tracking-tight mb-6">
          Letzte Scans
        </h1>
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-4 flex items-center gap-3">
              <div className="skeleton w-10 h-10 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="skeleton-text w-3/4" />
                <div className="skeleton-text w-1/3 h-[0.75em]" />
              </div>
              <div className="skeleton w-14 h-5 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="font-headline text-2xl text-[var(--text-primary)] tracking-tight mb-6">
        Letzte Scans
      </h1>

      {captures.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-sm text-[var(--text-tertiary)]">
            Noch keine Scans vorhanden.
          </p>
          <button
            onClick={() => router.push("/cardscan")}
            className="mt-4 py-2.5 px-5 rounded-[var(--radius-md)] btn-primary text-sm"
          >
            Ersten Scan starten
          </button>
        </div>
      )}

      <div className="space-y-2">
        {captures.map((c) => {
          const data = (c.extracted_data || c.final_data) as ExtractedContactData | null;
          const displayName = getDisplayName(data);
          const statusConf = STATUS_CONFIG[c.status] || STATUS_CONFIG.pending;
          const sourceLabel = SOURCE_LABELS[c.source_type] || c.source_type;

          return (
            <button
              key={c.id}
              onClick={() => {
                if (c.status === "review") {
                  router.push(`/cardscan/review/${c.id}`);
                } else if (c.status !== "pending" && c.status !== "extracting" && c.status !== "writing") {
                  router.push(`/cardscan/history/${c.id}`);
                }
              }}
              className="card w-full text-left p-4 flex items-center gap-3 hover:shadow-[var(--shadow-hover)] transition-shadow"
            >
              {/* Quelle-Icon */}
              <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--bg-input)] flex items-center justify-center text-[var(--text-tertiary)] text-xs font-medium shrink-0">
                {sourceLabel}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                  {displayName}
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {formatDate(c.created_at)}
                </p>
              </div>

              {/* Status */}
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-medium shrink-0 ${statusConf.bg} ${statusConf.text}`}
              >
                {statusConf.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
