"use client";

/**
 * InboxLayoutToggle — Tabelle ↔ Inbox-Feed Switch im Pool-Scope.
 *
 * 03.06.2026 (Pool 2.0 Sprint 2): rendert ein 2-State-Pillen-Pair direkt
 * rechts neben den ScopeTabs. Click triggert Server-Roundtrip (Layout-
 * Pref in benutzer_rollen.dashboard_config persistieren + Cookie-
 * Invalidierung) + Optimistic UI mit `router.refresh()`.
 *
 * Drei-Sprachen-Disziplin: NICHT Owner/Status/Presence — eigene Sprache
 * "View-Mode" (analog kunden-client view-mode-toggle).
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";

export type PoolLayout = "inbox" | "table";

export function InboxLayoutToggle({ initial }: { initial: PoolLayout }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [layout, setLayout] = useState<PoolLayout>(initial);

  async function setPref(next: PoolLayout) {
    if (next === layout) return;
    setLayout(next);
    startTransition(async () => {
      try {
        await fetch("/api/pool/layout-pref", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ layout: next }),
          credentials: "same-origin",
        });
      } catch {
        // ignore — server-Render fällt im worst case auf altes Layout zurück
      }
      router.refresh();
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label="Pool-Ansicht"
      className="inline-flex bg-input border border-line rounded-md p-0.5"
    >
      <button
        type="button"
        role="radio"
        aria-checked={layout === "inbox"}
        onClick={() => setPref("inbox")}
        title="Inbox-Ansicht — Karten-Feed wie ein Posteingang"
        className={cn(
          "px-2.5 h-8 text-[12px] font-semibold rounded transition-colors inline-flex items-center gap-1.5",
          "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
          layout === "inbox"
            ? "bg-surface text-foreground shadow-card"
            : "text-foreground-subtle hover:text-foreground-muted",
        )}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-3.5 w-3.5" aria-hidden="true">
          <rect x="2" y="3" width="12" height="10" rx="1.5" />
          <path d="M2 8h12M5 5.5h6M5 10.5h6" strokeLinecap="round" />
        </svg>
        Inbox
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={layout === "table"}
        onClick={() => setPref("table")}
        title="Tabellen-Ansicht — kompakte Liste wie bisher"
        className={cn(
          "px-2.5 h-8 text-[12px] font-semibold rounded transition-colors inline-flex items-center gap-1.5",
          "focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]",
          layout === "table"
            ? "bg-surface text-foreground shadow-card"
            : "text-foreground-subtle hover:text-foreground-muted",
        )}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden="true">
          <path d="M2 4h12M2 8h12M2 12h12" />
        </svg>
        Tabelle
      </button>
    </div>
  );
}
