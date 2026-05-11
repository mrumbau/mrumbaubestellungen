"use client";

import { useMemo, useState } from "react";
import { CollapsibleWidget } from "./collapsible-widget";
import type { AuditEvent, WidgetId } from "./types";

/**
 * AuditTrail-Panel — vollständiger, filtrierbarer Event-Log einer Bestellung.
 *
 * 11.05.2026 — analog zur Timeline-Komponente, aber:
 *   - zeigt ALLE events ungekürzt (Timeline kürzt + aggregiert)
 *   - hat Kategorie-Filter (Status / Doku / Kommentar / System)
 *   - rendert actor + relative-time + structured payload
 *
 * Quelle: events-Tabelle (Single-Source-of-Truth aus Welle 4 O2).
 * RLS auf events filtert automatisch — Besteller sehen nur eigene.
 */

type Category = "alle" | "status" | "doku" | "kommentar" | "system";

const CATEGORY_LABEL: Record<Category, string> = {
  alle: "Alle",
  status: "Status & Freigabe",
  doku: "Dokumente",
  kommentar: "Kommentare",
  system: "System",
};

const EVENT_CATEGORY: Record<string, Exclude<Category, "alle">> = {
  // Status & Freigabe
  status_changed: "status",
  freigegeben: "status",
  freigabe_eingetragen: "status",
  bezahlt_markiert: "status",
  bestellung_freigegeben: "status",
  bestellung_bezahlt: "status",
  bestellung_abgelehnt: "status",
  // Doku
  doku_added: "doku",
  doku_removed: "doku",
  // Kommentar
  kommentar_added: "kommentar",
  // System
  created: "system",
  bestellungsart_geaendert: "system",
  mahnung_versendet: "system",
  archiviert: "system",
  reaktiviert: "system",
};

const EVENT_LABEL: Record<string, string> = {
  status_changed: "Status geändert",
  freigegeben: "Freigegeben",
  freigabe_eingetragen: "Freigabe eingetragen",
  bezahlt_markiert: "Als bezahlt markiert",
  bestellung_freigegeben: "Bestellung freigegeben (per Reply)",
  bestellung_bezahlt: "Als bezahlt markiert (per Reply)",
  bestellung_abgelehnt: "Abgelehnt (per Reply)",
  doku_added: "Dokument hinzugefügt",
  doku_removed: "Dokument entfernt",
  kommentar_added: "Kommentar",
  created: "Erstellt",
  bestellungsart_geaendert: "Bestellungsart geändert",
  mahnung_versendet: "Mahnung versendet",
  archiviert: "Archiviert",
  reaktiviert: "Reaktiviert",
};

function categoryOf(eventType: string): Exclude<Category, "alle"> {
  return EVENT_CATEGORY[eventType] ?? "system";
}

function labelOf(eventType: string): string {
  return EVENT_LABEL[eventType] ?? eventType;
}

function categoryDotClass(cat: Exclude<Category, "alle">): string {
  switch (cat) {
    case "status": return "bg-status-freigegeben";
    case "doku": return "bg-info";
    case "kommentar": return "bg-foreground-muted";
    case "system": return "bg-foreground-faint";
  }
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 60) return "gerade eben";
  if (diffSec < 3600) return `vor ${Math.floor(diffSec / 60)} Min`;
  if (diffSec < 86400) return `vor ${Math.floor(diffSec / 3600)} Std`;
  if (diffSec < 7 * 86400) return `vor ${Math.floor(diffSec / 86400)} Tagen`;
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PayloadView({ payload }: { payload: unknown }) {
  if (payload === null || payload === undefined) return null;
  if (typeof payload !== "object") {
    return (
      <span className="text-[11px] text-foreground-muted font-mono-amount">
        {String(payload)}
      </span>
    );
  }
  const obj = payload as Record<string, unknown>;
  const entries = Object.entries(obj).filter(([, v]) => v !== null && v !== "");
  if (entries.length === 0) return null;
  return (
    <dl className="mt-1.5 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-[11px]">
      {entries.map(([k, v]) => (
        <span key={k} className="contents">
          <dt className="text-foreground-subtle tabular-nums">{k}</dt>
          <dd className="text-foreground-muted font-mono-amount break-all">
            {typeof v === "object" ? JSON.stringify(v) : String(v)}
          </dd>
        </span>
      ))}
    </dl>
  );
}

export function AuditTrailPanel({
  events,
  widgetId,
  openWidgetId,
  onToggleWidget,
}: {
  events: AuditEvent[];
  widgetId: Extract<WidgetId, "audit-trail" | "m-audit-trail">;
  openWidgetId: string | null;
  onToggleWidget: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Category>("alle");

  const sorted = useMemo(() => {
    return [...events].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [events]);

  const filtered = useMemo(() => {
    if (filter === "alle") return sorted;
    return sorted.filter((e) => categoryOf(e.event_type) === filter);
  }, [sorted, filter]);

  if (sorted.length === 0) return null;

  // Count pro Kategorie für Filter-Pill-Badges
  const counts: Record<Category, number> = {
    alle: sorted.length,
    status: 0,
    doku: 0,
    kommentar: 0,
    system: 0,
  };
  for (const e of sorted) {
    counts[categoryOf(e.event_type)] += 1;
  }

  return (
    <CollapsibleWidget
      title="Audit-Trail"
      icon={
        <span aria-hidden="true" className="text-foreground-subtle [&_svg]:h-4 [&_svg]:w-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
        </span>
      }
      badge={
        <span className="font-mono-amount text-[10px] font-bold text-foreground-muted bg-canvas px-1.5 py-0.5 rounded">
          {sorted.length}
        </span>
      }
      widgetId={widgetId}
      openWidgetId={openWidgetId}
      onToggleWidget={onToggleWidget}
    >
      {/* Filter Pills */}
      <div
        className="flex flex-wrap gap-1.5 mb-3"
        role="tablist"
        aria-label="Audit-Trail Filter"
      >
        {(Object.keys(CATEGORY_LABEL) as Category[]).map((cat) => {
          const active = filter === cat;
          const n = counts[cat];
          const disabled = cat !== "alle" && n === 0;
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={disabled}
              onClick={() => setFilter(cat)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                active
                  ? "bg-brand text-white"
                  : disabled
                    ? "text-foreground-faint cursor-not-allowed"
                    : "bg-canvas text-foreground-muted hover:bg-line hover:text-foreground"
              }`}
            >
              {CATEGORY_LABEL[cat]}
              <span
                className={`tabular-nums ${
                  active ? "text-white/80" : "text-foreground-faint"
                }`}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* Empty-State im Filter */}
      {filtered.length === 0 ? (
        <p className="text-[12px] text-foreground-subtle py-4 text-center">
          Keine Events in dieser Kategorie.
        </p>
      ) : (
        <ol className="relative pl-4 space-y-3 before:absolute before:left-[5px] before:top-1 before:bottom-1 before:w-px before:bg-line">
          {filtered.map((e) => {
            const cat = categoryOf(e.event_type);
            return (
              <li key={e.id} className="relative">
                <span
                  aria-hidden="true"
                  className={`absolute -left-[15px] top-1 w-2.5 h-2.5 rounded-full ring-2 ring-surface ${categoryDotClass(cat)}`}
                />
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[12px] font-semibold text-foreground">
                    {labelOf(e.event_type)}
                  </span>
                  {e.actor && (
                    <span className="text-[11px] font-mono-amount text-foreground-muted">
                      {e.actor}
                    </span>
                  )}
                  <span
                    className="text-[10px] text-foreground-faint ml-auto"
                    title={formatAbsolute(e.created_at)}
                  >
                    {formatRelative(e.created_at)}
                  </span>
                </div>
                <PayloadView payload={e.payload} />
              </li>
            );
          })}
        </ol>
      )}
    </CollapsibleWidget>
  );
}
