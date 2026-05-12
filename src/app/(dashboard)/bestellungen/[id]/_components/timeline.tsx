"use client";

import { useMemo, useState } from "react";
import { CollapsibleWidget } from "./collapsible-widget";
import { timelineColor } from "@/lib/timeline-config";
import type { Abgleich, AuditEvent, Dokument, Freigabe, Kommentar, WidgetId } from "./types";

/**
 * Timeline — aggregated activity feed for a single Bestellung.
 *
 * 06.05.2026 (Welle 4 O2): nutzt jetzt vorrangig events-Tabelle als
 * Single-Source-of-Truth. Wenn events fehlen (vor Backfill / RLS-Filter blockt)
 * fällt der Build auf abgeleitete Items aus dokumente/abgleich/freigabe/kommentare
 * zurück (backward-kompatibel).
 *
 * 12.05.2026 — vorheriger doppelter „Audit-Trail"-Block (AuditTrailPanel) wurde
 * gelöscht und seine Kategorie-Filter sind jetzt direkt hier integriert. Status /
 * Dokumente / Kommentare / System filterbar via Pills oben.
 *
 * `widgetId` prop lets the caller decide whether the widget belongs to the
 * desktop-sidebar accordion group or the mobile-details accordion group, so
 * opening one does not collapse the other.
 */

type TimelineItemTyp = "dok" | "abgleich" | "freigabe" | "kommentar" | "status" | "info";

interface TimelineItem {
  zeit: string;
  label: string;
  typ: TimelineItemTyp;
  farbe: string;
}

type Category = "alle" | "status" | "doku" | "kommentar" | "system";

const CATEGORY_LABEL: Record<Category, string> = {
  alle: "Alle",
  status: "Status & Freigabe",
  doku: "Dokumente",
  kommentar: "Kommentare",
  system: "System",
};

function categoryOf(typ: TimelineItemTyp): Exclude<Category, "alle"> {
  // status_changed / freigabe / abgleich-Ergebnisse zählen alle als „Status & Freigabe"
  if (typ === "status" || typ === "freigabe" || typ === "abgleich") return "status";
  if (typ === "dok") return "doku";
  if (typ === "kommentar") return "kommentar";
  return "system"; // info = created / bezahlt / archiviert / mahnung / projekt_bestaetigt / bestellungsart_geaendert
}

export function Timeline({
  dokumente,
  abgleich,
  freigabe,
  kommentare,
  events,
  widgetId,
  openWidgetId,
  onToggleWidget,
}: {
  dokumente: Dokument[];
  abgleich: Abgleich | null;
  freigabe: Freigabe | null;
  kommentare: Kommentar[];
  events?: AuditEvent[];
  widgetId: Extract<WidgetId, "timeline" | "m-timeline">;
  openWidgetId: string | null;
  onToggleWidget: (id: string) => void;
}) {
  const items = useMemo<TimelineItem[]>(() => {
    // Events-Tabelle ist die reichhaltigere Quelle (status_changed, bezahlt,
    // mahnung, archiviert + alle alten Events). Fallback auf derived nur wenn
    // events leer (z.B. RLS-Filter blockt).
    if (events && events.length > 0) {
      return buildTimelineFromEvents(events);
    }
    return buildTimeline(dokumente, abgleich, freigabe, kommentare);
  }, [events, dokumente, abgleich, freigabe, kommentare]);

  const [filter, setFilter] = useState<Category>("alle");

  const filtered = useMemo(() => {
    if (filter === "alle") return items;
    return items.filter((t) => categoryOf(t.typ) === filter);
  }, [items, filter]);

  // Count pro Kategorie (für Filter-Pill-Badges)
  const counts: Record<Category, number> = {
    alle: items.length,
    status: 0,
    doku: 0,
    kommentar: 0,
    system: 0,
  };
  for (const t of items) {
    counts[categoryOf(t.typ)] += 1;
  }

  if (items.length === 0) return null;

  return (
    <CollapsibleWidget
      title="Aktivitätsverlauf"
      icon={
        <span aria-hidden="true" className="text-foreground-subtle [&_svg]:h-4 [&_svg]:w-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </span>
      }
      badge={
        <span className="font-mono-amount text-[10px] font-bold text-foreground-muted bg-canvas px-1.5 py-0.5 rounded">
          {items.length}
        </span>
      }
      widgetId={widgetId}
      openWidgetId={openWidgetId}
      onToggleWidget={onToggleWidget}
    >
      {/* Filter-Pills (12.05.2026 — aus ehemaligem AuditTrailPanel migriert) */}
      <div
        className="flex flex-wrap gap-1.5 mb-3"
        role="tablist"
        aria-label="Aktivitätsverlauf-Filter"
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

      {filtered.length === 0 ? (
        <p className="text-[12px] text-foreground-subtle py-4 text-center">
          Keine Einträge in dieser Kategorie.
        </p>
      ) : (
        <div className="relative">
          <div
            aria-hidden="true"
            className="absolute left-[7px] top-2 bottom-2 w-px bg-line"
          />
          <ol className="space-y-3">
            {filtered.map((t, i) => (
              <li key={i} className="flex items-start gap-3 relative">
                <span
                  aria-hidden="true"
                  className="w-[15px] h-[15px] rounded-full border-2 border-surface shrink-0 z-10"
                  style={{ background: t.farbe }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-foreground leading-relaxed">{t.label}</p>
                  <p className="text-[10px] text-foreground-subtle font-mono-amount">
                    {new Date(t.zeit).toLocaleString("de-DE")}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </CollapsibleWidget>
  );
}

function buildTimeline(
  dokumente: Dokument[],
  abgleich: Abgleich | null,
  freigabe: Freigabe | null,
  kommentare: Kommentar[],
): TimelineItem[] {
  const typLabels: Record<string, string> = {
    bestellbestaetigung: "Bestellbestätigung",
    lieferschein: "Lieferschein",
    rechnung: "Rechnung",
    aufmass: "Aufmaß",
    leistungsnachweis: "Leistungsnachweis",
    versandbestaetigung: "Versandbestätigung",
  };

  const items: TimelineItem[] = [];

  for (const d of dokumente) {
    items.push({
      zeit: d.created_at,
      label: `${typLabels[d.typ] || d.typ} eingegangen`,
      typ: "dok",
      farbe: timelineColor("dok"),
    });
  }
  if (abgleich) {
    items.push({
      zeit: abgleich.erstellt_am,
      label: `KI-Abgleich: ${abgleich.status === "ok" ? "OK" : "Abweichung"}`,
      typ: "abgleich",
      farbe:
        abgleich.status === "ok"
          ? timelineColor("abgleich_ok")
          : timelineColor("abgleich_abweichung"),
    });
  }
  if (freigabe) {
    items.push({
      zeit: freigabe.freigegeben_am,
      label: `Freigegeben von ${freigabe.freigegeben_von_name}`,
      typ: "freigabe",
      farbe: timelineColor("freigabe"),
    });
  }
  for (const k of kommentare) {
    items.push({
      zeit: k.erstellt_am,
      label: `${k.autor_kuerzel}: "${k.text.slice(0, 60)}${k.text.length > 60 ? "…" : ""}"`,
      typ: "kommentar",
      farbe: timelineColor("kommentar"),
    });
  }
  return items.sort((a, b) => new Date(a.zeit).getTime() - new Date(b.zeit).getTime());
}

/**
 * 06.05.2026 (Welle 4 O2) — Timeline-Items aus events-Tabelle bauen.
 * Reichhaltiger als der derived buildTimeline: enthält status_changed,
 * bezahlt_markiert, mahnung_versendet, archiviert, projekt_bestaetigt etc.
 */
function buildTimelineFromEvents(events: AuditEvent[]): TimelineItem[] {
  const typLabels: Record<string, string> = {
    bestellbestaetigung: "Bestellbestätigung",
    lieferschein: "Lieferschein",
    rechnung: "Rechnung",
    aufmass: "Aufmaß",
    leistungsnachweis: "Leistungsnachweis",
    versandbestaetigung: "Versandbestätigung",
  };
  const statusLabels: Record<string, string> = {
    erwartet: "Erwartet",
    offen: "Offen",
    vollstaendig: "Vollständig",
    abweichung: "Abweichung",
    ls_fehlt: "LS fehlt",
    freigegeben: "Freigegeben",
  };

  return events
    .map<TimelineItem | null>((e) => {
      // payload ist DB-Json (string | number | bool | obj | array). Per
      // Convention sind unsere Event-Payloads immer Objekte → cast für
      // bequeme Property-Lookup. Pro Event-Type sind die erwarteten Felder
      // im Trigger-Code (run.ts log_event-Aufrufe) definiert.
      const p = (e.payload ?? {}) as Record<string, unknown>;
      switch (e.event_type) {
        case "created":
          return {
            zeit: e.created_at,
            label: `Bestellung angelegt${p.zuordnung_methode ? ` (Zuordnung: ${p.zuordnung_methode})` : ""}`,
            typ: "info",
            farbe: timelineColor("created"),
          };
        case "doku_added": {
          const typ = String(p.typ ?? "");
          return {
            zeit: e.created_at,
            label: `${typLabels[typ] || typ || "Dokument"} eingegangen${p.gesamtbetrag ? ` (${p.gesamtbetrag} €)` : ""}`,
            typ: "dok",
            farbe: timelineColor("dok"),
          };
        }
        case "status_changed": {
          const from = String(p.from ?? "");
          const to = String(p.to ?? "");
          return {
            zeit: e.created_at,
            label: `Status: ${statusLabels[from] || from} → ${statusLabels[to] || to}`,
            typ: "status",
            farbe: timelineColor("status_changed"),
          };
        }
        case "freigegeben":
        case "freigabe_eingetragen":
          return {
            zeit: e.created_at,
            label: `Freigegeben${e.actor ? ` von ${e.actor}` : ""}${p.kommentar ? `: "${String(p.kommentar).slice(0, 60)}"` : ""}`,
            typ: "freigabe",
            farbe: timelineColor("freigabe"),
          };
        case "bezahlt_markiert":
          return {
            zeit: e.created_at,
            label: `Als bezahlt markiert${e.actor ? ` von ${e.actor}` : ""}${p.betrag ? ` (${p.betrag} €)` : ""}`,
            typ: "info",
            farbe: timelineColor("bezahlt"),
          };
        case "archiviert":
          return {
            zeit: e.created_at,
            label: `Archiviert${e.actor ? ` von ${e.actor}` : ""}`,
            typ: "info",
            farbe: timelineColor("archiviert"),
          };
        case "mahnung_versendet":
          return {
            zeit: e.created_at,
            label: `Mahnung versendet (${p.mahnung_count || 1}.)`,
            typ: "info",
            farbe: timelineColor("mahnung"),
          };
        case "kommentar_added":
          return {
            zeit: e.created_at,
            label: `${e.actor || "?"}: "${String(p.text_excerpt || "").slice(0, 60)}${String(p.text_excerpt || "").length > 60 ? "…" : ""}"`,
            typ: "kommentar",
            farbe: timelineColor("kommentar"),
          };
        case "projekt_bestaetigt":
          return {
            zeit: e.created_at,
            label: `Projekt bestätigt${p.projekt_name ? `: ${p.projekt_name}` : ""}`,
            typ: "info",
            farbe: timelineColor("projekt_bestaetigt"),
          };
        case "bestellungsart_geaendert":
          return {
            zeit: e.created_at,
            label: `Bestellungsart: ${p.from} → ${p.to}`,
            typ: "info",
            farbe: timelineColor("bestellungsart_geaendert"),
          };
        default:
          // Unbekannter Event-Type — fallback-Render
          return {
            zeit: e.created_at,
            label: e.event_type,
            typ: "info",
            farbe: timelineColor("status_changed"),
          };
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => new Date(a.zeit).getTime() - new Date(b.zeit).getTime());
}
