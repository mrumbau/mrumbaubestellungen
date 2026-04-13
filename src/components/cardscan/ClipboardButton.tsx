"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ClipboardState = "idle" | "reading" | "processing" | "error";

export function ClipboardButton() {
  const router = useRouter();
  const [state, setState] = useState<ClipboardState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleClipboard() {
    setState("reading");
    setError(null);

    try {
      if (navigator.clipboard.read) {
        try {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            const imageType = item.types.find((t) => t.startsWith("image/"));
            if (imageType) {
              setState("processing");
              const blob = await item.getType(imageType);
              const file = new File([blob], "clipboard.jpg", { type: imageType });
              const formData = new FormData();
              formData.append("file", file);
              formData.append("source_type", "clipboard");
              const res = await fetch("/api/cardscan/extract", { method: "POST", body: formData });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "Fehler");
              router.push(`/cardscan/review/${data.capture_id}`);
              return;
            }
            if (item.types.includes("text/plain")) {
              const blob = await item.getType("text/plain");
              const text = await blob.text();
              return await handleClipboardText(text);
            }
          }
          setError("Keine verwertbaren Daten in der Zwischenablage.");
          setState("idle");
          return;
        } catch (readErr) {
          if (readErr instanceof Error && readErr.name === "NotAllowedError") {
            setError("Zugriff auf Zwischenablage verweigert. Bitte erlaube den Zugriff in den Browser-Einstellungen.");
            setState("idle");
            return;
          }
          // Andere Fehler (z.B. API-Fehler) nach oben weiterreichen
          throw readErr;
        }
      }

      const text = await navigator.clipboard.readText();
      if (!text || text.trim().length < 3) {
        setError("Zwischenablage ist leer oder enthält zu wenig Text.");
        setState("idle");
        return;
      }
      await handleClipboardText(text);
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("Zugriff auf Zwischenablage verweigert.");
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Fehler beim Lesen der Zwischenablage.");
      }
      setState("idle");
    }
  }

  async function handleClipboardText(text: string) {
    setState("processing");
    const trimmed = text.trim();

    if (/^https?:\/\//i.test(trimmed) && !trimmed.includes("\n")) {
      const res = await fetch("/api/cardscan/scrape-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "URL-Analyse fehlgeschlagen");
      router.push(`/cardscan/review/${data.capture_id}`);
      return;
    }

    const res = await fetch("/api/cardscan/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed, source_type: "clipboard" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Analyse fehlgeschlagen");
    router.push(`/cardscan/review/${data.capture_id}`);
  }

  return (
    <>
      <button
        onClick={handleClipboard}
        disabled={state === "reading" || state === "processing"}
        className="group relative block w-full card p-0 overflow-hidden text-left disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        <div className="flex items-center gap-4 px-5 py-4">
          <span className="font-mono-amount text-[11px] text-[var(--text-tertiary)] w-6 shrink-0">05</span>
          <div className="w-px h-8 bg-[var(--border-subtle)]" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)] group-hover:text-emerald-700 transition-colors">
              {state === "reading" ? "Lese Zwischenablage…" : state === "processing" ? "Analysiere…" : "Aus Zwischenablage"}
            </p>
            <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
              Text · Bild · URL automatisch erkennen
            </p>
          </div>
          {(state === "reading" || state === "processing") ? (
            <span className="spinner w-4 h-4 shrink-0" />
          ) : (
            <svg className="w-4 h-4 text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          )}
        </div>
      </button>
      {error && (
        <div className="p-3 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700 text-xs">
          {error}
        </div>
      )}
    </>
  );
}
