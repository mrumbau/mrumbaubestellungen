"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
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
      <h1 className="font-headline text-2xl text-[var(--text-primary)] tracking-tight mb-2">
        URL eingeben
      </h1>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        Firmenwebseite eingeben – Impressum und Kontaktseite werden automatisch
        mitdurchsucht.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
            </svg>
          </div>
          <input
            type="url"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="www.musterfirma.de"
            className="w-full py-3 pl-10 pr-4 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-primary)] text-base placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--mr-red)] focus:border-transparent"
            autoFocus
            disabled={loading}
          />
        </div>

        {/* Social-Media-Hinweis */}
        {showSocialHint && (
          <div className="mt-3 p-3 rounded-[var(--radius-md)] bg-amber-50 border border-amber-200 text-amber-700 text-sm">
            <p className="font-medium text-xs uppercase tracking-wider mb-1">Hinweis</p>
            <p>
              LinkedIn, Xing und andere soziale Netzwerke blockieren oft das
              automatische Auslesen. Bitte kopiere stattdessen den Profilinhalt
              und füge ihn unter{" "}
              <button
                type="button"
                onClick={() => router.push("/cardscan/paste")}
                className="underline font-medium"
              >
                „Text einfügen"
              </button>{" "}
              ein.
            </p>
          </div>
        )}

        {/* Beispiele */}
        <div className="mt-4 flex flex-wrap gap-2">
          {["musterfirma.de", "musterfirma.de/impressum", "musterfirma.de/kontakt"].map(
            (example) => (
              <button
                key={example}
                type="button"
                onClick={() => handleUrlChange(example)}
                className="text-xs px-2.5 py-1 rounded-full border border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:border-[var(--border-strong)] transition-colors"
              >
                {example}
              </button>
            )
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => router.push("/cardscan")}
            className="flex-1 py-3 px-4 rounded-[var(--radius-md)] border border-[var(--border-default)] text-[var(--text-secondary)] text-sm font-medium hover:bg-[var(--bg-input)] transition-colors"
            disabled={loading}
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={loading || url.trim().length < 5}
            className="flex-1 py-3 px-4 rounded-[var(--radius-md)] btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="spinner w-4 h-4" />
                Lade Seite…
              </>
            ) : (
              "Analysieren"
            )}
          </button>
        </div>
      </form>

      {/* Info-Box */}
      <div className="mt-8 card p-4">
        <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-2">
          So funktioniert es
        </h3>
        <ul className="text-xs text-[var(--text-tertiary)] space-y-1.5">
          <li>1. Hauptseite wird geladen und analysiert</li>
          <li>2. Falls wenig Kontaktdaten → Impressum &amp; Kontaktseite werden automatisch hinzugezogen</li>
          <li>3. GPT-4o extrahiert Firma, Ansprechpartner, Adresse, Kontaktdaten</li>
        </ul>
      </div>
    </div>
  );
}
