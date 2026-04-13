"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BackLink } from "@/components/cardscan/BackLink";

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
    <div className="max-w-lg md:max-w-xl mx-auto animate-fade-in">
      <BackLink />
      <h1 className="font-headline text-xl text-[var(--text-primary)] tracking-tight mb-1">
        Text einfügen
      </h1>
      <p className="text-sm text-[var(--text-tertiary)] mb-5">
        E-Mail-Signatur, Visitenkarten-Text oder Impressum einfügen.
      </p>

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
            className="w-full h-52 p-4 rounded-[var(--radius-md)] bg-[var(--bg-card)] text-[var(--text-primary)] text-base placeholder:text-[var(--text-tertiary)]/50 focus:outline-none resize-none border-0"
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
          <div className="mt-4 p-3 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || text.trim().length < 5 || text.length > 10_000}
          className="w-full mt-5 py-3.5 px-4 rounded-xl bg-[var(--bg-sidebar)] text-white text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--bg-sidebar-hover)] transition-colors flex items-center justify-center gap-2 min-h-[48px] active:scale-[0.98]"
        >
          {loading ? (
            <>
              <span className="spinner w-4 h-4 border-white/30 border-t-white" />
              Analysiere…
            </>
          ) : (
            "Analysieren"
          )}
        </button>
      </form>
    </div>
  );
}
