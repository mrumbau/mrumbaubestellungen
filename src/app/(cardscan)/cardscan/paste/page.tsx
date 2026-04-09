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

      // Weiterleitung zum Review-Screen
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
        Text einfügen
      </h1>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        E-Mail-Signatur, Visitenkarten-Text, Impressum oder beliebigen Text mit
        Kontaktdaten einfügen.
      </p>

      <form onSubmit={handleSubmit}>
        <label htmlFor="cardscan-text-input" className="sr-only">Kontaktdaten als Text</label>
        <textarea
          id="cardscan-text-input"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          placeholder={`Max Mustermann\nMusterfirma GmbH\nMusterstraße 1, 80331 München\nTel: 089 123456\nmax@musterfirma.de`}
          className="w-full h-48 p-4 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-primary)] text-base placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--mr-red)] focus:border-transparent resize-none"
          autoFocus
          disabled={loading}
        />

        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-[var(--text-tertiary)]">
            {text.length} / 10.000 Zeichen
          </span>
          {text.length > 10_000 && (
            <span className="text-xs text-red-600">Text zu lang</span>
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
            disabled={loading || text.trim().length < 5 || text.length > 10_000}
            className="flex-1 py-3 px-4 rounded-[var(--radius-md)] btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="spinner w-4 h-4" />
                Analysiere…
              </>
            ) : (
              "Analysieren"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
