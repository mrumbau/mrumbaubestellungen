"use client";

/**
 * usePoolSeenTracker — IntersectionObserver-basiertes Read/Unread-Tracking.
 *
 * 03.06.2026 (Pool 2.0 Sprint 2): jede Pool-Card die >1.5s in den
 * Viewport scrollt, wird zum "gelesen"-Kandidaten. Alle 3 Sekunden werden
 * gesammelte IDs als Batch an `pool_mark_seen` geschickt (max 50/Batch).
 *
 * Server-Page rendert das initiale unread-Set (User-State LEFT JOIN); der
 * Hook patcht den Optimistic-State und konsumiert keine Round-Trips für
 * bereits-als-gelesen markierte IDs.
 *
 * Verwendung:
 *   const { register, isSeen } = usePoolSeenTracker({
 *     initialUnread: ["uuid1","uuid2"],
 *   });
 *   <article ref={(el) => register(b.id, el)}>…</article>
 */

import { useCallback, useEffect, useRef, useState } from "react";

const VIEWPORT_DWELL_MS = 1500;
const FLUSH_INTERVAL_MS = 3000;
const BATCH_MAX = 50;

export interface UsePoolSeenTrackerOptions {
  /** UUIDs die initial als ungelesen markiert sind (vom Server). */
  initialUnread?: Iterable<string>;
}

export interface UsePoolSeenTrackerApi {
  register: (id: string, element: HTMLElement | null) => void;
  isSeen: (id: string) => boolean;
}

export function usePoolSeenTracker(
  options: UsePoolSeenTrackerOptions = {},
): UsePoolSeenTrackerApi {
  const [seenIds, setSeenIds] = useState<Set<string>>(() => new Set());
  const initialUnreadRef = useRef<Set<string>>(
    new Set(options.initialUnread ?? []),
  );

  // Pending-Buffer für noch nicht geflushte IDs
  const pendingRef = useRef<Set<string>>(new Set());
  // Track dwell-timers pro Element
  const dwellTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  // observer-Instanz
  const observerRef = useRef<IntersectionObserver | null>(null);
  // element ↔ id mapping
  const elementToIdRef = useRef<Map<Element, string>>(new Map());

  // Flush-Interval-Timer-Ref
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Snapshot-Ref damit IntersectionObserver-Callback keinen stale closure
  // auf den initialen useState-Wert von seenIds hat (Update kommt aus
  // flush() async).
  const seenIdsRef = useRef<Set<string>>(seenIds);
  useEffect(() => {
    seenIdsRef.current = seenIds;
  }, [seenIds]);

  // POST-Funktion
  const flush = useCallback(async () => {
    if (pendingRef.current.size === 0) return;
    // Bis BATCH_MAX rausnehmen
    const ids = Array.from(pendingRef.current).slice(0, BATCH_MAX);
    ids.forEach((id) => pendingRef.current.delete(id));

    try {
      await fetch("/api/pool/mark-seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
        credentials: "same-origin",
        keepalive: true,
      });
      // Erfolgreich → setSeen
      setSeenIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });
    } catch {
      // Network failure: zurück in pending (best-effort)
      ids.forEach((id) => pendingRef.current.add(id));
    }
  }, []);

  // Observer & Flush starten
  useEffect(() => {
    if (typeof window === "undefined") return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = elementToIdRef.current.get(entry.target);
          if (!id) return;
          if (entry.isIntersecting) {
            // Nur tracken wenn initial unread und noch nicht in pending/seen
            if (
              !initialUnreadRef.current.has(id) ||
              pendingRef.current.has(id) ||
              seenIdsRef.current.has(id)
            ) {
              return;
            }
            // Setze Dwell-Timer
            if (!dwellTimersRef.current.has(id)) {
              const t = setTimeout(() => {
                pendingRef.current.add(id);
                dwellTimersRef.current.delete(id);
              }, VIEWPORT_DWELL_MS);
              dwellTimersRef.current.set(id, t);
            }
          } else {
            // Out-of-view → Dwell abbrechen
            const t = dwellTimersRef.current.get(id);
            if (t) {
              clearTimeout(t);
              dwellTimersRef.current.delete(id);
            }
          }
        });
      },
      {
        threshold: 0.5, // 50% sichtbar = "gelesen-Kandidat"
      },
    );

    flushIntervalRef.current = setInterval(flush, FLUSH_INTERVAL_MS);

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
      if (flushIntervalRef.current) clearInterval(flushIntervalRef.current);
      dwellTimersRef.current.forEach((t) => clearTimeout(t));
      dwellTimersRef.current.clear();
      observerRef.current = null;
      elementToIdRef.current.clear();
      // Final flush bei Unmount (best-effort, fire-and-forget)
      void flush();
    };
  }, [flush]);

  const register = useCallback((id: string, element: HTMLElement | null) => {
    if (!observerRef.current) return;
    // Bekanntes Element neu registrieren → unobserve+observe ist idempotent
    // aber wir tracken auf Map-Ebene
    // Cleanup: vorheriges Element für diese ID untracken
    for (const [el, mappedId] of elementToIdRef.current.entries()) {
      if (mappedId === id && el !== element) {
        observerRef.current.unobserve(el);
        elementToIdRef.current.delete(el);
      }
    }
    if (element) {
      elementToIdRef.current.set(element, id);
      observerRef.current.observe(element);
    }
  }, []);

  const isSeen = useCallback(
    (id: string) =>
      !initialUnreadRef.current.has(id) || seenIds.has(id),
    [seenIds],
  );

  return { register, isSeen };
}
