"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BackLink } from "@/components/cardscan/BackLink";

interface SyncError {
  id: string;
  created_at: string;
  capture_id: string;
  crm: "crm1" | "crm2";
  error_type: string;
  error_message: string;
  acknowledged: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CardScanErrorsPage() {
  const router = useRouter();
  const [errors, setErrors] = useState<SyncError[]>([]);
  const [loading, setLoading] = useState(true);
  const [acknowledging, setAcknowledging] = useState(false);

  async function loadErrors() {
    try {
      const res = await fetch("/api/cardscan/errors");
      const json = await res.json();
      setErrors(json.data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadErrors();
  }, []);

  async function handleAcknowledge(errorId: string) {
    setAcknowledging(true);
    await fetch("/api/cardscan/errors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error_id: errorId }),
    });
    setErrors((prev) =>
      prev.map((e) => (e.id === errorId ? { ...e, acknowledged: true } : e))
    );
    setAcknowledging(false);
  }

  async function handleAcknowledgeAll() {
    setAcknowledging(true);
    await fetch("/api/cardscan/errors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acknowledge_all: true }),
    });
    setErrors((prev) => prev.map((e) => ({ ...e, acknowledged: true })));
    setAcknowledging(false);
  }

  const openErrors = errors.filter((e) => !e.acknowledged);
  const closedErrors = errors.filter((e) => e.acknowledged);

  if (loading) {
    return (
      <div className="max-w-lg md:max-w-xl mx-auto py-20 text-center">
        <div className="spinner w-8 h-8 mx-auto" />
      </div>
    );
  }

  return (
    <div className="max-w-lg md:max-w-xl mx-auto animate-fade-in">
      <BackLink />
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-headline text-xl text-foreground tracking-tight">
          Sync-Fehler
        </h1>
        {openErrors.length > 0 && (
          <span className="text-xs px-2.5 py-1 rounded-full bg-error-bg text-error font-medium">
            {openErrors.length} offen
          </span>
        )}
      </div>

      {errors.length === 0 && (
        <div className="card p-8 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-cs-accent-tint flex items-center justify-center">
            <svg className="w-7 h-7 text-cs-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <p className="text-sm text-foreground-subtle">
            Keine Sync-Fehler vorhanden.
          </p>
        </div>
      )}

      {/* Offene Fehler */}
      {openErrors.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-medium text-foreground-muted uppercase tracking-wider">
              Offene Fehler
            </h2>
            <button
              onClick={handleAcknowledgeAll}
              disabled={acknowledging}
              className="text-xs text-[var(--mr-red)] hover:underline font-medium"
            >
              Alle bestätigen
            </button>
          </div>

          <div className="space-y-2">
            {openErrors.map((err) => (
              <div key={err.id} className="card p-4 border-error-border">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded bg-error-bg text-error">
                        {err.crm === "crm1" ? "CRM 1" : "CRM 2"}
                      </span>
                      <span className="text-xs text-foreground-subtle">
                        {formatDate(err.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-foreground">
                      {err.error_message}
                    </p>
                    <p className="text-xs text-foreground-subtle mt-1">
                      Typ: {err.error_type}
                    </p>
                  </div>
                  <button
                    onClick={() => handleAcknowledge(err.id)}
                    disabled={acknowledging}
                    className="text-xs px-3.5 py-2.5 rounded-md border border-line text-foreground-muted hover:bg-input transition-colors shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    OK
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bestätigte Fehler */}
      {closedErrors.length > 0 && (
        <div>
          <h2 className="text-xs font-medium text-foreground-subtle uppercase tracking-wider mb-3">
            Bestätigt ({closedErrors.length})
          </h2>
          <div className="space-y-2 opacity-60">
            {closedErrors.slice(0, 10).map((err) => (
              <div key={err.id} className="card p-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="uppercase tracking-wider font-medium text-foreground-subtle">
                    {err.crm === "crm1" ? "CRM 1" : "CRM 2"}
                  </span>
                  <span className="flex-1 truncate text-foreground-muted">
                    {err.error_message}
                  </span>
                  <span className="text-foreground-subtle">
                    {formatDate(err.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
