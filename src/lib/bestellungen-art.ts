/**
 * Bestellungsart — Server-safe Types + Helpers (UX-R2, 03.06.2026).
 *
 * Extrahiert aus `art-filter-chips.tsx` (Client-Component), damit der
 * Server-side `loadLaneData` `parseArtFilter` aufrufen kann. Next.js
 * markiert ALLE Exports aus einer `"use client"`-Datei als Client-
 * Boundary — auch reine Funktionen ohne Hooks. Daher liegen die pure-
 * Helpers hier, und die Client-Component re-exportiert sie nur.
 */

export type Bestellungsart = "material" | "subunternehmer" | "abo";

export const ALL_BESTELLUNGSARTEN: ReadonlyArray<Bestellungsart> = [
  "material",
  "subunternehmer",
  "abo",
];

export function parseArtFilter(
  value: string | null | undefined,
): Set<Bestellungsart> {
  if (!value) return new Set();
  const tokens = value.split(",").map((t) => t.trim()).filter(Boolean);
  const valid = new Set<Bestellungsart>();
  for (const t of tokens) {
    if (t === "material" || t === "subunternehmer" || t === "abo") {
      valid.add(t);
    }
  }
  return valid;
}
