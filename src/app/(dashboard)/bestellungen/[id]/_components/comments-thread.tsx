"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CollapsibleWidget } from "./collapsible-widget";
import type { Kommentar, WidgetId } from "./types";

/**
 * CommentsThread — collapsible comment list + inline input.
 *
 * Desktop: Collapsible (folded by default to save sidebar vertical space).
 * Mobile: Non-collapsible variant via `mode="always-open"` for the mobile
 * aktionen-tab where users already expect the compose box to be visible.
 *
 * Controlled form state (lifted out of the monolith's global `kommentarText`).
 */
export function CommentsThread({
  kommentare,
  loading,
  onSubmit,
  widgetId,
  openWidgetId,
  onToggleWidget,
  mode = "collapsible",
}: {
  kommentare: Kommentar[];
  loading: boolean;
  onSubmit: (text: string) => Promise<boolean>;
  widgetId: Extract<WidgetId, "kommentare" | "m-kommentare">;
  openWidgetId?: string | null;
  onToggleWidget?: (id: string) => void;
  mode?: "collapsible" | "always-open";
}) {
  const [text, setText] = useState("");

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    const ok = await onSubmit(text);
    if (ok) setText("");
  }

  const body = (
    <>
      {kommentare.length > 0 ? (
        <ul className="space-y-3 mb-3">
          {kommentare.map((k) => (
            <li key={k.id}>
              <div className="flex items-center gap-2">
                <div
                  aria-hidden="true"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-brand text-white text-[9px] font-bold font-mono-amount"
                >
                  {k.autor_kuerzel}
                </div>
                <span className="text-[12px] font-semibold text-foreground">
                  {k.autor_name}
                </span>
                <span className="text-[11px] text-foreground-subtle font-mono-amount">
                  {new Date(k.erstellt_am).toLocaleDateString("de-DE")}
                </span>
              </div>
              <p className="text-[12px] text-foreground-muted mt-1 ml-8 leading-relaxed">
                {k.text}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-foreground-subtle mb-3">Noch keine Kommentare.</p>
      )}
      <form onSubmit={handle} className="flex gap-2 items-start">
        <div className="flex-1">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Kommentar schreiben…"
            inputSize="sm"
            aria-label="Neuen Kommentar schreiben"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          loading={loading}
          disabled={!text.trim()}
          aria-label="Kommentar senden"
        >
          Senden
        </Button>
      </form>
    </>
  );

  if (mode === "always-open") {
    return (
      <div className="card p-4">
        <h3 className="font-headline text-[13px] tracking-tight text-foreground mb-2">
          Kommentare
        </h3>
        {body}
      </div>
    );
  }

  return (
    <CollapsibleWidget
      title="Kommentare"
      icon={
        <span aria-hidden="true" className="text-foreground-subtle [&_svg]:h-4 [&_svg]:w-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
            />
          </svg>
        </span>
      }
      badge={
        kommentare.length > 0 ? (
          <span className="font-mono-amount text-[10px] font-bold text-foreground-muted bg-canvas px-1.5 py-0.5 rounded">
            {kommentare.length}
          </span>
        ) : undefined
      }
      widgetId={widgetId}
      openWidgetId={openWidgetId}
      onToggleWidget={onToggleWidget}
    >
      {body}
    </CollapsibleWidget>
  );
}
