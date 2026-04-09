"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CardScanPastePage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (text.trim().length < 5) {
      setError("Bitte mindestens 5 Zeichen eingeben.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/cardscan/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), source_type: "text" }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Ein Fehler ist aufgetreten.");
        return;
      }

      router.push(`/cardscan/review/${data.capture_id}`);
    } catch {
      setError("Verbindungsfehler. Bitte erneut versuchen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 rounded border border-[var(--border-default)] flex items-center justify-center">
            <span className="font-mono-amount text-[9px] text-[var(--text-tertiary)]">01</span>
          </div>
          <span className="text-[10px] text-[var(--text-tertiary)] tracking-[0.15em] uppercase font-mono-amount">
            Text einfügen
          </span>
        </div>
        <h1 className="font-headline text-2xl text-[var(--text-primary)] tracking-tight">
          Kontaktdaten <span className="text-[var(--text-tertiary)]">einfügen</span>
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-2">
          E-Mail-Signatur, Visitenkarten-Text, Impressum oder beliebigen Text.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card p-1 corner-marks">
          <label htmlFor="cardscan-text-input" className="sr-only">Kontaktdaten als Text</label>
          <textarea
            id="cardscan-text-input"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            placeholder={`Max Mustermann\nMusterfirma GmbH\nMusterstraße 1, 80331 München\nTel: 089 123456\nmax@musterfirma.de`}
            className="w-full h-52 p-4 rounded-[var(--radius-md)] bg-[var(--bg-card)] text-[var(--text-primary)] text-sm placeholder:text-[var(--text-tertiary)]/50 focus:outline-none resize-none border-0"
            autoFocus
            disabled={loading}
          />
        </div>

        <div className="mt-2 flex items-center justify-between px-1">
          <span className="font-mono-amount text-[10px] text-[var(--text-tertiary)]">
            {text.length.toLocaleString("de-DE")} <span className="text-[var(--text-tertiary)]/50">/ 10.000</span>
          </span>
          {text.length > 10_000 && (
            <span className="text-[10px] text-red-600 font-medium">Zu lang</span>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700 text-xs">
            {error}
          </div>
        )}

        {/* Separator */}
        <div className="industrial-line my-5" />

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push("/cardscan")}
            className="flex-1 py-3 px-4 rounded-[var(--radius-md)] border border-[var(--border-default)] text-[var(--text-secondary)] text-[13px] font-medium hover:bg-[var(--bg-input)] transition-colors min-h-[44px]"
            disabled={loading}
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={loading || text.trim().length < 5 || text.length > 10_000}
            className="flex-1 py-3 px-4 rounded-[var(--radius-md)] bg-[#141414] text-white text-[13px] font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#1f1f1f] transition-colors flex items-center justify-center gap-2 min-h-[44px]"
          >
            {loading ? (
              <>
                <span className="spinner w-4 h-4 border-white/30 border-t-white" />
                <span>Analysiere…</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
                <span>Analysieren</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
