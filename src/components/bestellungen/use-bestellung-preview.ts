"use client";

/**
 * useBestellungPreview — PDF-Preview-Modal State + Hover-Preload + Spatial-Continuity.
 *
 * Aus bestellungen-tabelle.tsx extrahiert (12.05.2026, F3.3 Sprint 2).
 *
 * Strategie:
 *   - Same-Origin-Proxy `/api/pdfs/{id}?typ={typ}` (X-Frame-Options-Workaround)
 *   - Hover-Preload via fetch() befüllt Browser-HTTP-Cache → iframe-Click rendert instant
 *   - preloadedSet verhindert doppelte Fetches bei mehreren Hovers
 *
 * Spatial-Continuity (12.05.2026, User-Feedback nach /emil-design-eng):
 *   - Während Modal offen: `previewId` markiert die Trigger-Row (persistent
 *     `.row-preview-active` Highlight in CSS).
 *   - Nach Schließen: `recentlyClosedId` bleibt 2.2s gesetzt → CSS-Animation
 *     `row-afterglow` fadet langsam zurück. User-Auge findet die Row sofort.
 *   - Plus: scroll-into-view falls Row nicht im Viewport (Modal verdeckt
 *     einen Großteil des Bildschirms — User scrollt manchmal IM Modal weg
 *     oder kommt von einer entfernten Row zurück).
 *   - prefers-reduced-motion respektiert (scroll-behavior + Animation).
 */

import { useCallback, useEffect, useRef, useState } from "react";

const AFTERGLOW_MS = 2200;

export function useBestellungPreview() {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recentlyClosedId, setRecentlyClosedId] = useState<string | null>(null);
  const afterglowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const clearAfterglow = useCallback(() => {
    if (afterglowTimer.current) {
      clearTimeout(afterglowTimer.current);
      afterglowTimer.current = null;
    }
    setRecentlyClosedId(null);
  }, []);

  const handlePreview = useCallback(
    (bestellungId: string, typ: string) => {
      // Wenn User direkt von einer Afterglow-Row zur nächsten Preview springt,
      // den Afterglow stoppen damit nur eine Row gleichzeitig markiert ist.
      clearAfterglow();
      setPreviewId(bestellungId);
      setPreviewUrl(buildPreviewUrl(bestellungId, typ));
    },
    [buildPreviewUrl, clearAfterglow],
  );

  const closePreview = useCallback(() => {
    setPreviewId((prevId) => {
      if (prevId && typeof window !== "undefined") {
        // Afterglow starten — Row bekommt 2.2s das gleiche Highlight wie
        // im Modal-offen-Zustand und fadet dann via CSS-Animation aus.
        setRecentlyClosedId(prevId);
        if (afterglowTimer.current) clearTimeout(afterglowTimer.current);
        afterglowTimer.current = setTimeout(() => {
          setRecentlyClosedId(null);
          afterglowTimer.current = null;
        }, AFTERGLOW_MS);

        // Scroll into view falls Row nicht sichtbar (User scrollte im Modal
        // weg oder kam von weit oben). nextFrame damit Modal-Close-Animation
        // erst die layout transformiert.
        const idForScroll = prevId;
        requestAnimationFrame(() => {
          const escaped = typeof CSS !== "undefined" && "escape" in CSS
            ? CSS.escape(idForScroll)
            : idForScroll.replace(/"/g, '\\"');
          const row = document.querySelector(`tr[data-row-id="${escaped}"]`);
          if (row instanceof HTMLElement) {
            const rect = row.getBoundingClientRect();
            const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;
            if (!inView) {
              const reduceMotion = window.matchMedia(
                "(prefers-reduced-motion: reduce)",
              ).matches;
              row.scrollIntoView({
                block: "nearest",
                behavior: reduceMotion ? "auto" : "smooth",
              });
            }
          }
        });
      }
      return null;
    });
    setPreviewUrl(null);
  }, []);

  useEffect(() => {
    return () => {
      if (afterglowTimer.current) clearTimeout(afterglowTimer.current);
    };
  }, []);

  return {
    previewId,
    previewUrl,
    recentlyClosedId,
    preloadPreview,
    handlePreview,
    closePreview,
  };
}
