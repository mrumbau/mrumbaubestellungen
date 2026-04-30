"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface ShareData {
  title?: string;
  text?: string;
  url?: string;
  file?: {
    name: string;
    type: string;
    size: number;
    data: number[];
  };
}

export default function CardScanSharePage() {
  return (
    <Suspense>
      <ShareHandler />
    </Suspense>
  );
}

function ShareHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "processing" | "error" | "empty">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleSharedData();
  }, []);

  async function handleSharedData() {
    try {
      const sessionId = searchParams.get("sid");
      const cacheKey = sessionId
        ? `/cardscan/share-data/${sessionId}`
        : "/cardscan/share-data";

      // Shared-Data aus Service Worker Cache lesen
      const cache = await caches.open("cardscan-share");
      const response = await cache.match(cacheKey);

      if (!response) {
        setStatus("empty");
        return;
      }

      const shareData: ShareData = await response.json();

      // Cache aufräumen
      await cache.delete(cacheKey);

      // Entscheiden was wir haben
      if (shareData.file) {
        // Datei → Upload-Pipeline
        setStatus("processing");
        await handleSharedFile(shareData.file);
        return;
      }

      if (shareData.url) {
        // URL → URL-Pipeline
        setStatus("processing");
        await handleSharedUrl(shareData.url);
        return;
      }

      if (shareData.text) {
        // Text → Text-Pipeline
        setStatus("processing");
        await handleSharedText(shareData.text);
        return;
      }

      setStatus("empty");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Fehler beim Verarbeiten"
      );
      setStatus("error");
    }
  }

  async function handleSharedFile(fileData: ShareData["file"]) {
    if (!fileData) return;

    const bytes = new Uint8Array(fileData.data);
    const file = new File([bytes], fileData.name, { type: fileData.type });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("source_type", "share");

    const res = await fetch("/api/cardscan/extract", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Extraktion fehlgeschlagen");

    router.replace(`/cardscan/review/${data.capture_id}`);
  }

  async function handleSharedUrl(url: string) {
    const res = await fetch("/api/cardscan/scrape-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Scraping fehlgeschlagen");

    router.replace(`/cardscan/review/${data.capture_id}`);
  }

  async function handleSharedText(text: string) {
    const res = await fetch("/api/cardscan/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, source_type: "share" }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Extraktion fehlgeschlagen");

    router.replace(`/cardscan/review/${data.capture_id}`);
  }

  if (status === "loading" || status === "processing") {
    return (
      <div className="max-w-xl mx-auto py-20 text-center">
        <div className="spinner w-8 h-8 mx-auto" />
        <p className="text-sm text-foreground-subtle mt-4">
          {status === "loading"
            ? "Geteilte Daten werden geladen…"
            : "Wird analysiert…"}
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="max-w-xl mx-auto py-20 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-error-bg flex items-center justify-center">
          <svg className="w-8 h-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <p className="text-sm text-error mb-4">{error}</p>
        <button
          onClick={() => router.push("/cardscan")}
          className="text-sm text-foreground-muted underline"
        >
          Zurück zu CardScan
        </button>
      </div>
    );
  }

  // empty
  return (
    <div className="max-w-xl mx-auto py-20 text-center">
      <p className="text-sm text-foreground-subtle mb-4">
        Keine geteilten Daten gefunden.
      </p>
      <button
        onClick={() => router.push("/cardscan")}
        className="py-3 px-6 rounded-md btn-primary text-sm"
      >
        Zu CardScan
      </button>
    </div>
  );
}
