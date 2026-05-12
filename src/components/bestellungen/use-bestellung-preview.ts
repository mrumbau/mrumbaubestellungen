"use client";

/**
 * useBestellungPreview — PDF-Preview-Modal State + Hover-Preload.
 *
 * Aus bestellungen-tabelle.tsx extrahiert (12.05.2026, F3.3 Sprint 2).
 *
 * Strategie:
 *   - Same-Origin-Proxy `/api/pdfs/{id}?typ={typ}` (X-Frame-Options-Workaround)
 *   - Hover-Preload via fetch() befüllt Browser-HTTP-Cache → iframe-Click rendert instant
 *   - preloadedSet verhindert doppelte Fetches bei mehreren Hovers
 */

import { useCallback, useRef, useState } from "react";

export function useBestellungPreview() {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const preloadedSet = useRef<Set<string>>(new Set());

  const buildPreviewUrl = useCallback(
    (bestellungId: string, typ: string) =>
      `/api/pdfs/${bestellungId}?typ=${encodeURIComponent(typ)}`,
    [],
  );

  const preloadPreview = useCallback(
    (bestellungId: string, typ: string) => {
      const key = `${bestellungId}:${typ}`;
      if (preloadedSet.current.has(key)) return;
      preloadedSet.current.add(key);
      void fetch(buildPreviewUrl(bestellungId, typ), {
        credentials: "same-origin",
      }).catch(() => preloadedSet.current.delete(key));
    },
    [buildPreviewUrl],
  );

  const handlePreview = useCallback(
    (bestellungId: string, typ: string) => {
      setPreviewId(bestellungId);
      setPreviewUrl(buildPreviewUrl(bestellungId, typ));
    },
    [buildPreviewUrl],
  );

  const closePreview = useCallback(() => {
    setPreviewId(null);
    setPreviewUrl(null);
  }, []);

  return {
    previewId,
    previewUrl,
    preloadPreview,
    handlePreview,
    closePreview,
  };
}
