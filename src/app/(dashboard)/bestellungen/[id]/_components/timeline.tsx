"use client";

import { useMemo } from "react";
import { CollapsibleWidget } from "./collapsible-widget";
import { timelineColor } from "@/lib/timeline-config";
import type { Abgleich, Dokument, Freigabe, Kommentar, WidgetId } from "./types";

/**
 * Timeline — aggregated activity feed for a single Bestellung.
 *
 * Combines entries from `dokumente`, `abgleich`, `freigabe` and `kommentare`
 * into one chronological list. Pure derived state — no API calls. Uses a
 * vertical rail + dot pattern for dense, scannable output.
 *
 * `widgetId` prop lets the caller decide whether the widget belongs to the
 * desktop-sidebar accordion group or the mobile-details accordion group, so
 * opening one does not collapse the other.
 */
export function Timeline({
  dokumente,
  abgleich,
  freigabe,
  kommentare,
  widgetId,
  openWidgetId,
  onToggleWidget,
}: {
  dokumente: Dokument[];
  abgleich: Abgleich | null;
  freigabe: Freigabe | null;
  kommentare: Kommentar[];
  widgetId: Extract<WidgetId, "timeline" | "m-timeline">;
  openWidgetId: string | null;
  onToggleWidget: (id: string) => void;
}) {
  const items = useMemo(() => buildTimeline(dokumente, abgleich, freigabe, kommentare), [
    dokumente,
    abgleich,
    freigabe,
    kommentare,
  ]);

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
      <div className="relative">
        <div
          aria-hidden="true"
          className="absolute left-[7px] top-2 bottom-2 w-px bg-line"
        />
        <ol className="space-y-3">
          {items.map((t, i) => (
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
    </CollapsibleWidget>
  );
}

function buildTimeline(
  dokumente: Dokument[],
  abgleich: Abgleich | null,
  freigabe: Freigabe | null,
  kommentare: Kommentar[],
): {
  zeit: string;
  label: string;
  typ: "dok" | "abgleich" | "freigabe" | "kommentar";
  farbe: string;
}[] {
  const typLabels: Record<string, string> = {
    bestellbestaetigung: "Bestellbestätigung",
    lieferschein: "Lieferschein",
    rechnung: "Rechnung",
    aufmass: "Aufmaß",
    leistungsnachweis: "Leistungsnachweis",
    versandbestaetigung: "Versandbestätigung",
  };

  const items: {
    zeit: string;
    label: string;
    typ: "dok" | "abgleich" | "freigabe" | "kommentar";
    farbe: string;
  }[] = [];

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
