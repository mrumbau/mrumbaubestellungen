"use client";

/**
 * PresenceBanner — visualisiert "wer schaut sich diese Bestellung gerade auch an?".
 *
 * Drei-Sprachen-Disziplin (siehe DESIGN.md): Presence ist **Awareness**, nicht
 * **Authority**. Deshalb:
 *   - Kein Brand-Anker (keine MR-Red).
 *   - Statischer 6px-Live-Dot (kein Pulse → industrial-tone, nicht verspielt).
 *   - Neutral-muted Text-Token, nicht Workflow-Color.
 *
 * Layout:
 *   - **1 Viewer**: kleine 5×5-Pill mit Initialen + Name + "seit X Min."
 *   - **2+ Viewer**: gestackte Initial-Pills (max 3 sichtbar), Counter-Suffix
 *     "+N weitere", Tooltip mit allen Namen.
 *   - Bei 0 Viewern rendert die Component null (Banner verschwindet).
 *
 * Multi-Tab-Hinweis: zwei Tabs desselben Users werden in dedupeViewers() schon
 * zur ältesten Session zusammengefasst — hier zeigen wir nie doppelte Avatare.
 *
 * 02.06.2026 (Pool Phase 4).
 */

import { useEffect, useState } from "react";
import { type PresenceViewer, formatPresenceJoined } from "@/lib/hooks/use-bestellung-presence";

interface PresenceBannerProps {
  viewers: PresenceViewer[];
}

const MAX_VISIBLE_AVATARS = 3;

export function PresenceBanner({ viewers }: PresenceBannerProps) {
  // 02.06.2026 — "seit X Min." driftet wenn der Hook nicht neu rendert.
  // Eigenes 30s-Tick reicht weil Presence-State nicht öfter wechselt als das.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const handle = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(handle);
  }, []);

  if (!viewers.length) return null;

  const visible = viewers.slice(0, MAX_VISIBLE_AVATARS);
  const hiddenCount = viewers.length - visible.length;
  const allNames = viewers.map((v) => v.name).join(", ");

  return (
    <div
      className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-canvas text-[12px] text-foreground-subtle"
      role="status"
      aria-label={`${viewers.length} weitere ${viewers.length === 1 ? "Person schaut" : "Personen schauen"} gerade auf diese Bestellung: ${allNames}`}
      title={allNames}
    >
      <span aria-hidden="true" className="relative inline-flex items-center">
        {visible.map((v, i) => (
          <span
            key={v.kuerzel}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-input border border-line text-[10px] font-bold font-mono-amount text-foreground-muted"
            style={{ marginLeft: i === 0 ? 0 : -6, zIndex: visible.length - i }}
          >
            {v.kuerzel}
          </span>
        ))}
        {hiddenCount > 0 && (
          <span
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-input border border-line text-[10px] font-medium text-foreground-muted px-1"
            style={{ marginLeft: -6, zIndex: 0 }}
          >
            +{hiddenCount}
          </span>
        )}
        {/* Statischer Live-Dot — KEIN Pulse, KEIN Brand-Anker. */}
        <span className="absolute -bottom-0.5 -right-0.5 inline-block h-1.5 w-1.5 rounded-full bg-success ring-2 ring-canvas" />
      </span>
      <span className="hidden sm:inline">
        {viewers.length === 1
          ? `${viewers[0].name} schaut ${formatPresenceJoined(viewers[0].joined_at)}`
          : `${viewers.length} weitere schauen gerade`}
      </span>
      <span className="sm:hidden">
        {viewers.length === 1 ? viewers[0].kuerzel : `${viewers.length}`}
      </span>
    </div>
  );
}
