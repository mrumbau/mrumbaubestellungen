"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";

/**
 * Realtime-Presence-Hook für eine Bestellung (Pool Phase 4).
 *
 * Wenn mehrere Besteller dieselbe Bestelldetail-Seite offen haben, sehen sie
 * gegenseitig wer schon dran ist — verhindert Doppelarbeit ohne Hard-Lock.
 *
 * Architektur:
 *   - Ein Supabase-Realtime-Presence-Channel pro Bestellung
 *     (`presence-bestellung-{id}`).
 *   - Beim Subscribe → `channel.track({kuerzel, name, joined_at})`.
 *   - Beim Unmount → `channel.untrack()` + `removeChannel()`.
 *   - State `viewers` enthält ALLE getrackten Sessions (inkl. self), bereit
 *     deduped + self-excluded für den Renderer.
 *
 * Edge-Cases (gemäß Risiko #2 der Phase-4-Synthese):
 *   - **Multi-Tab pro User** (MT auf Desktop UND Phone): zwei presence-Keys
 *     mit gleichem kuerzel. `dedupeViewers` fasst sie zur ersten Session zusammen
 *     (älteste joined_at gewinnt — "MT ist seit X dran").
 *   - **Self-Exclusion**: aktueller User wird via `excludeKuerzel` aus der
 *     Liste entfernt. Banner zeigt nur ANDERE.
 *   - **Channel-Drop bei Netzwechsel**: graceful — viewers wird auf [] gesetzt,
 *     Pill verschwindet, kein "unknown"-State. Reconnect läuft automatisch
 *     via Supabase-SDK.
 *   - **Stale-Presence nach Tab-Crash**: Supabase-SDK hat Server-side TTL
 *     (~30s ohne Heartbeat → untrack). Acceptable für Best-Effort-Awareness.
 *
 * Nicht persistiert: Presence ist explizit ephemer. Kein DB-Insert, kein
 * Audit-Trail. "Wer schaut gerade" ist Awareness, nicht Authority.
 *
 * 02.06.2026.
 */

export interface PresenceViewer {
  kuerzel: string;
  name: string;
  /** ISO-Timestamp aus channel.track — Server-side ggf. Drift, akzeptiert. */
  joined_at: string;
}

export interface UseBestellungPresenceOptions {
  bestellungId: string | null;
  selfKuerzel: string;
  selfName: string;
  /** Wenn true, wird der Hook deaktiviert (z.B. fuer Anonym-Browsing). */
  disabled?: boolean;
}

/**
 * Deduped + self-excluded Viewer-Liste, sortiert nach ältester joined_at zuerst
 * (= "wer ist am längsten dran"). Reine Funktion, isoliert testbar.
 */
export function dedupeViewers(
  raw: PresenceViewer[],
  excludeKuerzel: string,
): PresenceViewer[] {
  const byKuerzel = new Map<string, PresenceViewer>();
  for (const v of raw) {
    if (v.kuerzel === excludeKuerzel) continue;
    if (!v.kuerzel) continue;
    const existing = byKuerzel.get(v.kuerzel);
    if (!existing || new Date(v.joined_at).getTime() < new Date(existing.joined_at).getTime()) {
      byKuerzel.set(v.kuerzel, v);
    }
  }
  return [...byKuerzel.values()].sort(
    (a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime(),
  );
}

export function useBestellungPresence(opts: UseBestellungPresenceOptions): PresenceViewer[] {
  const [viewers, setViewers] = useState<PresenceViewer[]>([]);

  useEffect(() => {
    if (!opts.bestellungId || opts.disabled) {
      setViewers([]);
      return;
    }
    if (!opts.selfKuerzel) return;

    const supabase = createBrowserSupabaseClient();
    const channelName = `presence-bestellung-${opts.bestellungId}`;
    const channel = supabase.channel(channelName, {
      config: { presence: { key: opts.selfKuerzel } },
    });

    function collectState() {
      // Supabase-Typdefinition für presenceState() ist generisch {presence_ref}.
      // Wir tracken aber custom Felder via channel.track(); der Server reicht sie
      // einfach durch. unknown-Cast vermeidet die fehlerhafte Default-Typisierung.
      const state = channel.presenceState() as unknown as Record<
        string,
        Array<{ kuerzel?: unknown; name?: unknown; joined_at?: unknown }>
      >;
      const all: PresenceViewer[] = [];
      for (const presences of Object.values(state)) {
        for (const p of presences) {
          if (
            p &&
            typeof p.kuerzel === "string" &&
            typeof p.joined_at === "string"
          ) {
            const name = typeof p.name === "string" ? p.name : p.kuerzel;
            all.push({ kuerzel: p.kuerzel, name, joined_at: p.joined_at });
          }
        }
      }
      setViewers(dedupeViewers(all, opts.selfKuerzel));
    }

    channel
      .on("presence", { event: "sync" }, collectState)
      .on("presence", { event: "join" }, collectState)
      .on("presence", { event: "leave" }, collectState)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            kuerzel: opts.selfKuerzel,
            name: opts.selfName,
            joined_at: new Date().toISOString(),
          });
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          // Graceful: leer rendern statt "unknown".
          setViewers([]);
        }
      });

    return () => {
      void channel.untrack().catch(() => {});
      supabase.removeChannel(channel);
      setViewers([]);
    };
  }, [opts.bestellungId, opts.selfKuerzel, opts.selfName, opts.disabled]);

  return viewers;
}

/**
 * Relative-Zeit-Formatter für Presence-Anzeige.
 * "gerade eben" / "vor 2 Min." / "vor 1 Std." — kurz, scan-bar, deutsch.
 */
export function formatPresenceJoined(joinedAt: string): string {
  const diffMs = Date.now() - new Date(joinedAt).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `seit ${min} Min.`;
  const std = Math.floor(min / 60);
  if (std < 24) return `seit ${std} Std.`;
  return "seit über einem Tag";
}
