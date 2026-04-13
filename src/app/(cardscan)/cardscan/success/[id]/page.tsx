"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { CardScanCapture, ExtractedContactData } from "@/lib/cardscan/types";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 text-xs font-mono-amount text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
      title={`${label} kopieren`}
    >
      {text}
      {copied ? (
        <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
        </svg>
      )}
    </button>
  );
}

function ProjectCreateCard({
  crm1CustomerId, crm2CustomerId, displayName,
}: {
  crm1CustomerId: string | null; crm2CustomerId: string | null; displayName: string;
}) {
  const [projectName, setProjectName] = useState(displayName);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<"idle" | "success" | "error">("idle");

  async function handleCreate() {
    if (!projectName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/cardscan/create-project", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_name: projectName.trim(), crm1_customer_id: crm1CustomerId, crm2_customer_id: crm2CustomerId }),
      });
      setResult(res.ok ? "success" : "error");
    } catch { setResult("error"); } finally { setCreating(false); }
  }

  if (result === "success") {
    return (
      <div className="card p-4 mb-5 flex items-center gap-3 text-sm text-emerald-700">
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        Projekt &quot;{projectName}&quot; erstellt
      </div>
    );
  }

  return (
    <div className="card p-4 mb-5">
      <p className="text-xs text-[var(--text-secondary)] mb-3 font-medium">Projekt anlegen?</p>
      <div className="flex gap-2">
        <input
          type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)}
          placeholder="Projektname"
          className="flex-1 py-2.5 px-3 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--mr-red)] min-h-[44px]"
        />
        <button
          onClick={handleCreate} disabled={creating || !projectName.trim()}
          className="py-2.5 px-4 rounded-[var(--radius-md)] bg-[var(--bg-sidebar)] text-white text-sm font-medium disabled:opacity-30 hover:bg-[var(--bg-sidebar-hover)] transition-colors min-h-[44px]"
        >
          {creating ? <span className="spinner w-4 h-4 border-white/30 border-t-white" /> : "Erstellen"}
        </button>
      </div>
      {result === "error" && <p className="text-xs text-red-600 mt-2">Konnte nicht erstellt werden.</p>}
    </div>
  );
}

function CrmRow({ label, status, refNum, error: err }: { label: string; status: string | null; refNum: string | null; error: string | null }) {
  const s = status || "pending";
  const conf: Record<string, { dot: string; text: string }> = {
    success: { dot: "bg-emerald-500", text: "Erstellt" },
    failed: { dot: "bg-red-500", text: "Fehler" },
    skipped: { dot: "bg-slate-400", text: "Dry-Run" },
    pending: { dot: "bg-amber-400", text: "Ausstehend" },
  };
  const c = conf[s] || conf.pending;

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2.5">
        <span className={`w-2 h-2 rounded-full ${c.dot}`} />
        <span className="text-sm text-[var(--text-primary)]">{label}</span>
      </div>
      <div className="text-right">
        {refNum ? (
          <CopyButton text={refNum} label="Kundennummer" />
        ) : (
          <span className="text-xs text-[var(--text-tertiary)]">{c.text}</span>
        )}
        {err && <p className="text-[10px] text-red-500 mt-0.5 max-w-[200px] truncate">{err}</p>}
      </div>
    </div>
  );
}

export default function CardScanSuccessPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [capture, setCapture] = useState<CardScanCapture | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/cardscan/captures/${id}`).then((r) => r.json()).then((j) => { if (j.data) setCapture(j.data); }).finally(() => setLoading(false));
  }, [id]);

  // Haptik
  useEffect(() => {
    if (!capture || loading) return;
    if (navigator.vibrate) {
      capture.status === "failed" ? navigator.vibrate([100, 50, 100]) : navigator.vibrate([50, 30, 50]);
    }
  }, [capture, loading]);

  if (loading) {
    return (
      <div className="max-w-lg md:max-w-xl mx-auto py-12">
        <div className="skeleton w-14 h-14 rounded-2xl mx-auto mb-5" />
        <div className="skeleton-text w-1/3 h-6 mx-auto mb-2" />
        <div className="skeleton-text w-2/3 h-4 mx-auto mb-8" />
        <div className="card p-4 space-y-3">
          <div className="skeleton w-full h-8" />
          <div className="skeleton w-full h-8" />
        </div>
      </div>
    );
  }

  const data: ExtractedContactData | null = capture?.final_data || capture?.extracted_data || null;
  const isCompany = data?.customer_type === "company";
  const displayName = data
    ? isCompany
      ? data.companyName || [data.firstName, data.lastName].filter(Boolean).join(" ")
      : [data.firstName, data.lastName].filter(Boolean).join(" ")
    : "Kontakt";
  const isFailed = capture?.status === "failed";
  const isPartial = capture?.status === "partial_success";

  return (
    <div className="max-w-lg md:max-w-xl mx-auto py-8 animate-fade-in">
      {/* ─── Hero: Kontaktname groß + Icon ─────────────────────────── */}
      <div className="text-center mb-8">
        <div className={`w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center ${
          isFailed ? "bg-red-50 animate-shake" : "bg-emerald-50 animate-scale-in"
        }`}>
          {isFailed ? (
            <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          ) : (
            <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
          )}
        </div>

        <h1 className="font-headline text-xl text-[var(--text-primary)] tracking-tight">
          {displayName}
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          {isFailed ? "Konnte nicht angelegt werden" : isPartial ? "Teilweise angelegt" : "Erfolgreich angelegt"}
        </p>
      </div>

      {/* ─── CRM-Status ───────────────────────────────────────────── */}
      <div className="card p-4 mb-5">
        <CrmRow label="CRM 1" status={capture?.crm1_status || null} refNum={capture?.crm1_reference_number || null} error={capture?.crm1_error || null} />
        <div className="border-t border-[var(--border-subtle)] my-1" />
        <CrmRow label="CRM 2" status={capture?.crm2_status || null} refNum={capture?.crm2_reference_number || null} error={capture?.crm2_error || null} />
      </div>

      {/* ─── Projekt anlegen ──────────────────────────────────────── */}
      {!isFailed && (capture?.crm1_customer_id || capture?.crm2_customer_id) && (
        <ProjectCreateCard
          crm1CustomerId={capture.crm1_customer_id}
          crm2CustomerId={capture.crm2_customer_id}
          displayName={displayName}
        />
      )}

      {/* ─── Aktionen ─────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <button
          onClick={() => router.push("/cardscan")}
          className="flex-1 py-3.5 px-4 rounded-xl bg-[var(--bg-sidebar)] text-white text-sm font-medium hover:bg-[var(--bg-sidebar-hover)] transition-colors min-h-[48px] active:scale-[0.98]"
        >
          Neuer Scan
        </button>
        <button
          onClick={() => router.push("/cardscan/history")}
          className="flex-1 py-3.5 px-4 rounded-xl border border-[var(--border-default)] text-[var(--text-secondary)] text-sm font-medium hover:bg-[var(--bg-input)] transition-colors min-h-[48px] active:scale-[0.98]"
        >
          Historie
        </button>
      </div>
    </div>
  );
}
