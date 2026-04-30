"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BackLink } from "@/components/cardscan/BackLink";

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

    let trimmed = url.trim();

    // Leerzeichen und Whitespace entfernen
    trimmed = trimmed.replace(/\s+/g, "");

    // Protokoll hinzufügen wenn fehlt
    if (trimmed && !trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      trimmed = `https://${trimmed}`;
    }

    // Mindestens eine Domain mit Punkt
    if (!trimmed || !trimmed.includes(".") || trimmed.length < 8) {
      setError("Bitte eine Domain eingeben, z.B. musterfirma.de");
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

      const raw = await res.text();
      let data: { error?: string; capture_id?: string } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        // Antwort ist kein JSON (z.B. HTML-Fehlerseite vom Hosting)
      }

      if (!res.ok) {
        setError(data.error || `Server-Fehler (${res.status}). Bitte erneut versuchen.`);
        return;
      }

      if (!data.capture_id) {
        setError("Unerwartete Antwort vom Server.");
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
      <h1 className="font-headline text-xl text-foreground tracking-tight mb-1">
        URL analysieren
      </h1>
      <p className="text-sm text-foreground-subtle mb-5">
        Impressum und Kontaktseite werden automatisch mitdurchsucht.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="card p-1 corner-marks">
          <input
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="musterfirma.de"
            className="w-full py-3.5 px-4 bg-surface text-foreground text-base placeholder:text-foreground-subtle/50 focus:outline-none rounded-md border-0"
            autoFocus
            disabled={loading}
          />
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
          <div className="mt-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
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
                <span className="font-mono-amount text-[9px] text-foreground-subtle mt-0.5 shrink-0 w-4">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[11px] text-foreground-subtle">{step}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !url.trim().includes(".")}
          className="w-full mt-5 py-3.5 px-4 rounded-xl bg-sidebar text-white text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-sidebar-hover transition-colors flex items-center justify-center gap-2 min-h-[48px] active:scale-[0.98]"
        >
          {loading ? (
            <>
              <span className="spinner w-4 h-4 border-white/30 border-t-white" />
              Lade Seite…
            </>
          ) : (
            "Analysieren"
          )}
        </button>
      </form>
    </div>
  );
}
