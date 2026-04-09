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
      // Versuche zuerst read() (kann Bilder enthalten)
      if (navigator.clipboard.read) {
        try {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            // Bild in Zwischenablage → Upload-Pipeline
            const imageType = item.types.find((t) => t.startsWith("image/"));
            if (imageType) {
              setState("processing");
              const blob = await item.getType(imageType);
              const file = new File([blob], "clipboard.jpg", {
                type: imageType,
              });
              const formData = new FormData();
              formData.append("file", file);
              formData.append("source_type", "clipboard");

              const res = await fetch("/api/cardscan/extract", {
                method: "POST",
                body: formData,
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "Fehler");
              router.push(`/cardscan/review/${data.capture_id}`);
              return;
            }

            // Text in Zwischenablage
            if (item.types.includes("text/plain")) {
              const blob = await item.getType("text/plain");
              const text = await blob.text();
              return await handleClipboardText(text);
            }
          }

          // Fallback wenn kein passender Typ
          setError("Keine verwertbaren Daten in der Zwischenablage.");
          setState("idle");
          return;
        } catch (readErr) {
          // read() fehlgeschlagen → Fallback auf readText()
          if (
            readErr instanceof Error &&
            readErr.name === "NotAllowedError"
          ) {
            setError(
              "Zugriff auf Zwischenablage verweigert. Bitte erlaube den Zugriff in den Browser-Einstellungen."
            );
            setState("idle");
            return;
          }
        }
      }

      // Fallback: readText()
      const text = await navigator.clipboard.readText();
      if (!text || text.trim().length < 3) {
        setError("Zwischenablage ist leer oder enthält zu wenig Text.");
        setState("idle");
        return;
      }

      await handleClipboardText(text);
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError(
          "Zugriff auf Zwischenablage verweigert. Bitte erlaube den Zugriff in den Browser-Einstellungen."
        );
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

    // URL erkennen → URL-Pipeline
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

    // Sonst → Text-Pipeline
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
        className="card card-hover p-4 flex items-center gap-4 w-full text-left"
      >
        <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--mr-red)]/5 flex items-center justify-center text-[var(--mr-red)] shrink-0">
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Aus Zwischenablage
          </p>
          <p className="text-xs text-[var(--text-tertiary)]">
            {state === "reading"
              ? "Lese Zwischenablage…"
              : state === "processing"
                ? "Analysiere…"
                : "Text, Bild oder URL aus Clipboard"}
          </p>
        </div>
        {(state === "reading" || state === "processing") && (
          <span className="spinner w-5 h-5 shrink-0" />
        )}
        {state === "idle" && (
          <svg
            className="w-5 h-5 text-[var(--text-tertiary)] shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.25 4.5l7.5 7.5-7.5 7.5"
            />
          </svg>
        )}
      </button>
      {error && (
        <div className="p-3 rounded-[var(--radius-md)] bg-red-50 border border-red-200 text-red-700 text-sm -mt-1">
          {error}
        </div>
      )}
    </>
  );
}
