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
 * Multi-Document-Support (12.05.2026, User-Feedback "bei Einträgen die 2
 * Rechnungen haben sollte man auch bei PDF-Vorschau das auch sehen"):
 *   - handlePreview lädt parallel `/api/pdfs/list?bestellung_id=X&typ=Y` und
 *     bekommt zurück alle Doc-IDs des Typs. Bei Multi-Doc-Bestellungen
 *     (z.B. Raab-Karcher mit 2 Teilrechnungen) bekommt der User Prev/Next-
 *     Navigation in der Modal.
 *   - Erste Anzeige: Doc 1/N. Mit `goToDoc(index)` wechselbar.
 *   - Wenn nur 1 Doc existiert → fallback zur Bestellung-ID-API (gleiches
 *     Verhalten wie vorher).
 *
 * Spatial-Continuity:
 *   - Während Modal offen: `previewId` markiert die Trigger-Row.
 *   - Nach Schließen: `recentlyClosedId` bleibt 2.2s gesetzt für Afterglow.
 *   - Scroll-into-view falls Row nicht sichtbar.
 *   - prefers-reduced-motion respektiert.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const AFTERGLOW_MS = 2200;

interface PreviewDoc {
  id: string;
  created_at: string | null;
  gesamtbetrag: number | null;
}

export function useBestellungPreview() {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewTyp, setPreviewTyp] = useState<string | null>(null);
  const [previewDocs, setPreviewDocs] = useState<PreviewDoc[]>([]);
  const [previewDocIndex, setPreviewDocIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recentlyClosedId, setRecentlyClosedId] = useState<string | null>(null);
  const afterglowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preloadedSet = useRef<Set<string>>(new Set());

  const buildPreviewUrlByDocId = useCallback(
    (docId: string) => `/api/pdfs/${docId}`,
    [],
  );
  const buildPreviewUrlByBestellung = useCallback(
    (bestellungId: string, typ: string) =>
      `/api/pdfs/${bestellungId}?typ=${encodeURIComponent(typ)}`,
    [],
  );

  const preloadPreview = useCallback(
    (bestellungId: string, typ: string) => {
      const key = `${bestellungId}:${typ}`;
      if (preloadedSet.current.has(key)) return;
      preloadedSet.current.add(key);
      void fetch(buildPreviewUrlByBestellung(bestellungId, typ), {
        credentials: "same-origin",
      }).catch(() => preloadedSet.current.delete(key));
    },
    [buildPreviewUrlByBestellung],
  );

  const handlePreview = useCallback(
    (bestellungId: string, typ: string) => {
      // Race-Bereinigung gegen schnelle Wechsel zwischen Previews.
      setRecentlyClosedId(null);
      if (afterglowTimer.current) {
        clearTimeout(afterglowTimer.current);
        afterglowTimer.current = null;
      }
      setPreviewId(bestellungId);
      setPreviewTyp(typ);
      setPreviewDocIndex(0);
      // Sofort den optimistischen URL setzen (per Bestellung-ID-Fallback —
      // funktioniert immer für single-doc und für die "neueste" bei multi-doc).
      // Parallel die Doc-Liste laden für Multi-Doc-Pagination.
      setPreviewUrl(buildPreviewUrlByBestellung(bestellungId, typ));
      setPreviewDocs([]);
      void fetch(
        `/api/pdfs/list?bestellung_id=${encodeURIComponent(bestellungId)}&typ=${encodeURIComponent(typ)}`,
        { credentials: "same-origin" },
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { docs?: PreviewDoc[] } | null) => {
          const docs = data?.docs ?? [];
          if (docs.length > 1) {
            // Multi-Doc: switch zu per-Doc-ID-URL damit Pagination stabil ist.
            // Wenn nur 1 doc da ist, bleibt der Bestellung-Fallback-URL aktiv.
            setPreviewDocs(docs);
            setPreviewUrl(buildPreviewUrlByDocId(docs[0].id));
          } else if (docs.length === 1) {
            // Nur 1 Doc — kein Nav nötig, alte URL beibehalten.
            setPreviewDocs(docs);
          }
        })
        .catch(() => {
          // Stille fail — alte URL funktioniert weiter.
        });
    },
    [buildPreviewUrlByBestellung, buildPreviewUrlByDocId],
  );

  const goToDoc = useCallback(
    (index: number) => {
      if (previewDocs.length <= 1) return;
      const safe = Math.max(0, Math.min(index, previewDocs.length - 1));
      setPreviewDocIndex(safe);
      setPreviewUrl(buildPreviewUrlByDocId(previewDocs[safe].id));
    },
    [previewDocs, buildPreviewUrlByDocId],
  );

  const closePreview = useCallback(() => {
    setPreviewId((prevId) => {
      if (prevId && typeof window !== "undefined") {
        setRecentlyClosedId(prevId);
        if (afterglowTimer.current) clearTimeout(afterglowTimer.current);
        afterglowTimer.current = setTimeout(() => {
          setRecentlyClosedId(null);
          afterglowTimer.current = null;
        }, AFTERGLOW_MS);

        const idForScroll = prevId;
        requestAnimationFrame(() => {
          const escaped =
            typeof CSS !== "undefined" && "escape" in CSS
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
    setPreviewTyp(null);
    setPreviewDocs([]);
    setPreviewDocIndex(0);
  }, []);

  useEffect(() => {
    return () => {
      if (afterglowTimer.current) clearTimeout(afterglowTimer.current);
    };
  }, []);

  return {
    previewId,
    previewTyp,
    previewUrl,
    previewDocs,
    previewDocIndex,
    goToDoc,
    recentlyClosedId,
    preloadPreview,
    handlePreview,
    closePreview,
  };
}
