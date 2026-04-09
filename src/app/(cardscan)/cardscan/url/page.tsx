"use client";

import { useState } from "react";
import { useTransitionRouter } from "next-view-transitions";

const SOCIAL_DOMAINS = ["linkedin.com", "xing.com", "facebook.com", "instagram.com"];

function isSocialUrl(url: string): boolean {
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    return SOCIAL_DOMAINS.some((d) => host.includes(d));
  } catch {
    return false;
  }
}

export default function CardScanUrlPage() {
  const router = useTransitionRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSocialHint, setShowSocialHint] = useState(false);

  function handleUrlChange(value: string) {
    setUrl(value);
    setShowSocialHint(isSocialUrl(value));
    if (error) setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = url.trim();
    if (trimmed.length < 5) {
      setError("Bitte eine gültige URL eingeben.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/cardscan/scrape-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Scraping fehlgeschlagen.");
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
            <span className="font-mono-amount text-[9px] text-[var(--text-tertiary)]">04</span>
          </div>
          <span className="text-[10px] text-[var(--text-tertiary)] tracking-[0.15em] uppercase font-mono-amount">
            URL eingeben
          </span>
        </div>
        <h1 className="font-headline text-2xl text-[var(--text-primary)] tracking-tight">
          Webseite <span className="text-[var(--text-tertiary)]">analysieren</span>
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-2">
          Impressum und Kontaktseite werden automatisch mitdurchsucht.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card p-1 corner-marks">
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <span className="font-mono-amount text-[11px] text-[var(--text-tertiary)]">https://</span>
            </div>
            <input
              type="url"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="www.musterfirma.de"
              className="w-full py-3.5 pl-[4.5rem] pr-4 bg-[var(--bg-card)] text-[var(--text-primary)] text-sm placeholder:text-[var(--text-tertiary)]/50 focus:outline-none rounded-[var(--radius-md)] border-0"
              autoFocus
              disabled={loading}
            />
          </div>
        </div>

        {/* Social-Media-Hinweis */}
        {showSocialHint && (
          <div className="mt-3 card p-4 border-amber-200 bg-amber-50/50">
            <p className="text-xs text-amber-700">
              <span className="font-medium">Hinweis:</span> LinkedIn, Xing und soziale Netzwerke blockieren automatisches Auslesen.
              Bitte kopiere stattdessen den Profilinhalt und nutze{" "}
              <button
                type="button"
                onClick={() => router.push("/cardscan/paste")}
                className="underline font-medium"
              >
                Text einfügen
              </button>.
            </p>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700 text-xs">
            {error}
          </div>
        )}

        {/* How it works */}
        <div className="mt-5 px-1">
          <div className="space-y-1.5">
            {[
              "Hauptseite wird geladen und analysiert",
              "Impressum & Kontaktseite automatisch hinzugezogen",
              "GPT-4o extrahiert Firma, Ansprechpartner, Adresse",
            ].map((step, i) => (
              <div key={step} className="flex items-start gap-2.5">
                <span className="font-mono-amount text-[9px] text-[var(--text-tertiary)] mt-0.5 shrink-0 w-4">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[11px] text-[var(--text-tertiary)]">{step}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="industrial-line my-5" />

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push("/cardscan")}
            className="flex-1 py-3 px-4 rounded-[var(--radius-md)] border border-[var(--border-default)] text-[var(--text-secondary)] text-sm font-medium hover:bg-[var(--bg-input)] transition-colors min-h-[44px]"
            disabled={loading}
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={loading || url.trim().length < 5}
            className="flex-1 py-3 px-4 rounded-[var(--radius-md)] bg-[var(--bg-sidebar)] text-white text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--bg-sidebar-hover)] transition-colors flex items-center justify-center gap-2 min-h-[44px]"
          >
            {loading ? (
              <>
                <span className="spinner w-4 h-4 border-white/30 border-t-white" />
                <span>Lade Seite…</span>
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
