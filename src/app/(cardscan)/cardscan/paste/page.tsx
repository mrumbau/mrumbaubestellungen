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
        Text einfügen
      </h1>
      <p className="text-sm text-foreground-subtle mb-5">
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
            className="w-full h-52 p-4 rounded-md bg-surface text-foreground text-base placeholder:text-foreground-subtle/50 focus:outline-none resize-none border-0"
            autoFocus
            disabled={loading}
          />
        </div>

        <div className="mt-2 flex items-center justify-between px-1">
          <span className="font-mono-amount text-[10px] text-foreground-subtle">
            {text.length.toLocaleString("de-DE")} <span className="text-foreground-subtle/50">/ 10.000</span>
          </span>
          {text.length > 10_000 && (
            <span className="text-[10px] text-error font-medium">Zu lang</span>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-md bg-error-bg border border-error-border text-error text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || text.trim().length < 5 || text.length > 10_000}
          className="w-full mt-5 py-3.5 px-4 rounded-xl bg-sidebar text-white text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-sidebar-hover transition-colors flex items-center justify-center gap-2 min-h-[48px] active:scale-[0.98]"
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
