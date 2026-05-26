"use client";

import { useSyncExternalStore } from "react";

/**
 * Liest den Viewport-Breakpoint reaktiv aus.
 *
 * Default-Schwelle: 768px (Tailwind `md:`). SSR-Default ist `true` (Desktop),
 * weil die App primär Desktop ist und das hydration-mismatch-Risiko minimiert
 * werden soll. Mobile-User sehen kurz die Desktop-Variante bevor der Hook
 * nach Mount auf Mobile umschaltet — akzeptabel als interner Flash.
 *
 * Verwendung: anstelle von Tailwind `hidden md:flex` + `md:hidden` Doppel-
 * mounting (DOM hat dann beide Subtrees, was schwere Components wie iframes
 * doppelt initialisiert), conditional rendern.
 *
 * 22.05.2026 (Perf Stufe 2.7) — eingeführt nachdem `loading="lazy"` auf
 * PDF-iframes nicht zuverlässig den 2. Fetch verhinderte (Chrome lädt lazy
 * iframes auch in display:none-Parents bei initialer Navigation).
 */
export function useIsDesktop(minWidthPx = 768): boolean {
  return useSyncExternalStore(
    (callback) => {
      if (typeof window === "undefined") return () => {};
      const mq = window.matchMedia(`(min-width: ${minWidthPx}px)`);
      mq.addEventListener("change", callback);
      return () => mq.removeEventListener("change", callback);
    },
    () => {
      if (typeof window === "undefined") return true;
      return window.matchMedia(`(min-width: ${minWidthPx}px)`).matches;
    },
    () => true, // SSR-Snapshot: Desktop. Hydration-safe weil Tailwind-Default md:flex auch Desktop zeigt.
  );
}
