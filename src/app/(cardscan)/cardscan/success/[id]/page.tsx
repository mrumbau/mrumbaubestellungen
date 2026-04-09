"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { CardScanCapture, ExtractedContactData } from "@/lib/cardscan/types";

function CrmStatusBadge({ status, label }: { status: string | null; label: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    success: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Erstellt" },
    failed: { bg: "bg-red-50", text: "text-red-700", label: "Fehlgeschlagen" },
    skipped: { bg: "bg-slate-50", text: "text-slate-600", label: "Dry-Run" },
    pending: { bg: "bg-amber-50", text: "text-amber-700", label: "Ausstehend" },
  };

  const s = config[status || "pending"] || config.pending;

  return (
    <div className="flex items-center justify-between text-sm py-2">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className={`text-xs px-2.5 py-1 rounded-[var(--radius-sm)] font-medium ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    </div>
  );
}

export default function CardScanSuccessPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [capture, setCapture] = useState<CardScanCapture | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/cardscan/captures/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setCapture(json.data);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center">
        <div className="skeleton w-20 h-20 rounded-full mx-auto mb-6" />
        <div className="skeleton-text w-1/3 h-7 mx-auto mb-2" />
        <div className="skeleton-text w-2/3 h-4 mx-auto mb-8" />
        <div className="card p-4 mb-6 text-left space-y-3">
          <div className="skeleton-text w-1/4 h-3" />
          <div className="skeleton w-full h-8" />
          <div className="skeleton w-full h-8" />
        </div>
        <div className="flex gap-3">
          <div className="skeleton flex-1 h-12" />
          <div className="skeleton flex-1 h-12" />
        </div>
      </div>
    );
  }

  const data: ExtractedContactData | null =
    capture?.final_data || capture?.extracted_data || null;

  const displayName = data
    ? data.customer_type === "company"
      ? data.companyName || `${data.firstName || ""} ${data.lastName || ""}`.trim()
      : `${data.firstName || ""} ${data.lastName || ""}`.trim()
    : "Kontakt";

  const isSuccess = capture?.status === "success";
  const isPartial = capture?.status === "partial_success";
  const isFailed = capture?.status === "failed";

  // Haptisches Feedback beim Laden
  useEffect(() => {
    if (!capture || loading) return;
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      if (isFailed) {
        navigator.vibrate([100, 50, 100]);
      } else {
        navigator.vibrate([50, 30, 50]);
      }
    }
  }, [capture, loading, isFailed]);

  return (
    <div className="max-w-xl mx-auto py-12 text-center">
      {/* Icon mit Animation */}
      <div
        className={`w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center ${
          isFailed
            ? "bg-red-50 animate-shake"
            : isPartial
              ? "bg-amber-50 animate-scale-in"
              : "bg-emerald-50 animate-scale-in"
        }`}
      >
        {isFailed ? (
          <svg className="w-10 h-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : isPartial ? (
          <svg className="w-10 h-10 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        ) : (
          <svg className="w-10 h-10 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        )}
      </div>

      <h1 className="font-headline text-2xl text-[var(--text-primary)] tracking-tight mb-2">
        {isFailed
          ? "Anlage fehlgeschlagen"
          : isPartial
            ? "Teilweise angelegt"
            : "Erfolgreich angelegt"}
      </h1>
      <p className="text-sm text-[var(--text-secondary)] mb-8">
        <strong>{displayName}</strong>
        {isFailed
          ? " konnte in keinem CRM angelegt werden."
          : isPartial
            ? " wurde nur in einem CRM angelegt."
            : " wurde in beiden CRMs angelegt."}
      </p>

      {/* CRM-Status */}
      <div className="card p-4 mb-6 text-left">
        <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-3">
          CRM-Status
        </h2>
        <CrmStatusBadge status={capture?.crm1_status || null} label="CRM 1" />
        {capture?.crm1_reference_number && (
          <p className="text-xs text-[var(--text-tertiary)] pl-0 mb-2">
            Kundennr.: {capture.crm1_reference_number}
          </p>
        )}
        {capture?.crm1_error && (
          <p className="text-xs text-red-600 mb-2">{capture.crm1_error}</p>
        )}

        <div className="border-t border-[var(--border-subtle)] my-2" />

        <CrmStatusBadge status={capture?.crm2_status || null} label="CRM 2" />
        {capture?.crm2_reference_number && (
          <p className="text-xs text-[var(--text-tertiary)] mb-2">
            Kundennr.: {capture.crm2_reference_number}
          </p>
        )}
        {capture?.crm2_error && (
          <p className="text-xs text-red-600 mb-2">{capture.crm2_error}</p>
        )}
      </div>

      {/* Aktionen */}
      <div className="flex gap-3">
        <button
          onClick={() => router.push("/cardscan")}
          className="flex-1 py-3 px-4 rounded-[var(--radius-md)] btn-primary text-sm"
        >
          Neuer Scan
        </button>
        <button
          onClick={() => router.push("/cardscan/history")}
          className="flex-1 py-3 px-4 rounded-[var(--radius-md)] border border-[var(--border-default)] text-[var(--text-secondary)] text-sm font-medium hover:bg-[var(--bg-input)] transition-colors"
        >
          Historie
        </button>
      </div>
    </div>
  );
}
