"use client";

/**
 * useRowReturnFlash — Spatial-Continuity über Page-Navigation hinweg.
 *
 * 12.05.2026 (Continuity-Patch-Sprint, User-Feedback):
 *
 * Problem: User klickt eine Row in einer Tabelle → wird zur Detail-Seite
 * navigiert → klickt Back. Lands auf Tabelle ohne Anker — keine Ahnung mehr
 * welche Row man besucht hatte.
 *
 * Lösung: zweistufiger sessionStorage-Roundtrip:
 *   1. `recordRowVisit(scope, id)` — wird beim Navigieren in onRowClick
 *      aufgerufen, speichert {id, ts} unter scope-spezifischem Key.
 *   2. `useRowReturnFlash(scope)` — wird beim Mount der Listen-Seite
 *      aufgerufen, liest und CLEART den Eintrag, gibt ID zurück + scrolls
 *      die Row in View. Auto-clear nach 3.5s damit die afterglow-Animation
 *      einmal durchspielt.
 *
 * scope = "bestellungen" | "buchhaltung" | ... — verhindert Cross-Kontamination
 * wenn User von Bestellungen-Detail zu Buchhaltung wechselt (jede Liste
 * eigene Recent-Memory).
 *
 * MAX_AGE_MS = 5 min — wenn User die App lange verlässt und zurückkommt,
 * keine afterglow auf alten Werten (potenziell verwirrend).
 *
 * prefers-reduced-motion respektiert (scroll-behavior). Animation selbst
 * wird zentral in globals.css gegated.
 */

import { useEffect, useState } from "react";

const MAX_AGE_MS = 5 * 60 * 1000; // 5 min
const DURATION_MS = 3500;
const STORAGE_PREFIX = "mr:lastVisited:";

interface VisitRecord {
  id: string;
  ts: number;
}

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}${scope}`;
}

/** Im onRowClick aufrufen, kurz BEVOR navigation passiert. */
export function recordRowVisit(scope: string, id: string): void {
  if (typeof window === "undefined") return;
  try {
    const rec: VisitRecord = { id, ts: Date.now() };
    sessionStorage.setItem(storageKey(scope), JSON.stringify(rec));
  } catch {
    // sessionStorage kann in private-mode / quota-exceeded throwen — ignore.
  }
}

/**
 * Bei Mount: prüft den scope-Key, returned ID falls recent (<5min) und
 * cleared den Key (one-shot). Plus: scroll-into-view falls Row nicht im
 * Viewport.
 */
export function useRowReturnFlash(scope: string): string | null {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(storageKey(scope));
    } catch {
      return;
    }
    if (!raw) return;

    let rec: VisitRecord;
    try {
      rec = JSON.parse(raw) as VisitRecord;
    } catch {
      try {
        sessionStorage.removeItem(storageKey(scope));
      } catch {}
      return;
    }

    if (!rec?.id || typeof rec.ts !== "number") {
      try {
        sessionStorage.removeItem(storageKey(scope));
      } catch {}
      return;
    }

    if (Date.now() - rec.ts > MAX_AGE_MS) {
      try {
        sessionStorage.removeItem(storageKey(scope));
      } catch {}
      return;
    }

    // One-shot: clear, set state, scroll
    try {
      sessionStorage.removeItem(storageKey(scope));
    } catch {}

    const targetId = rec.id;
    setId(targetId);

    // Scroll-into-view nach next frame — gibt React Zeit, die Row
    // mit afterglow-class zu rendern.
    requestAnimationFrame(() => {
      const escaped =
        typeof CSS !== "undefined" && "escape" in CSS
          ? CSS.escape(targetId)
          : targetId.replace(/"/g, '\\"');
      const row = document.querySelector(`tr[data-row-id="${escaped}"]`);
      if (row instanceof HTMLElement) {
        const rect = row.getBoundingClientRect();
        const inView = rect.top >= 80 && rect.bottom <= window.innerHeight - 80;
        if (!inView) {
          const reduceMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
          ).matches;
          row.scrollIntoView({
            block: "center",
            behavior: reduceMotion ? "auto" : "smooth",
          });
        }
      }
    });

    const timer = setTimeout(() => setId(null), DURATION_MS);
    return () => clearTimeout(timer);
  }, [scope]);

  return id;
}
