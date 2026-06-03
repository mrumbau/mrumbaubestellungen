"use client";

/**
 * usePoolReservationsRealtime — Live-Sync der Pool-Reservation-Map.
 *
 * 03.06.2026 (Pool 2.0 Sprint 2): Inbox + Tabelle im Pool-Scope hören auf
 * INSERT/UPDATE/DELETE auf `pool_reservations` und halten eine Map
 * `bestellung_id → ReservationView` lokal. Throttle 1s damit Burst-
 * Refreshes (z. B. mehrere User reservieren gleichzeitig) keine Render-
 * Storms erzeugen.
 *
 * Snapshot-First-Load läuft via parent Server-Page-Query (die Karte
 * kennt schon den Initial-State). Der Hook patcht inkrementell.
 */

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export interface ReservationView {
  bestellung_id: string;
  user_kuerzel: string;
  user_name: string;
  expires_at: string;
}

export type ReservationMap = Record<string, ReservationView>;

type ReservationRow = {
  bestellung_id: string;
  user_kuerzel: string;
  user_name: string;
  expires_at: string;
};

const THROTTLE_MS = 1000;

export function usePoolReservationsRealtime(
  initial: ReservationMap = {},
): ReservationMap {
  const [map, setMap] = useState<ReservationMap>(initial);
  const pendingRef = useRef<ReservationMap | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialer Snapshot wird vom Caller (Server-Page) übergeben — wir mergen
  // ihn als ersten Patch, damit useState-Reset bei Re-Mount akkurat ist.
  useEffect(() => {
    setMap(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bewusst nur on mount
  }, []);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let channel: RealtimeChannel | null = null;

    function scheduleFlush(next: ReservationMap) {
      pendingRef.current = next;
      if (flushTimerRef.current) return;
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        if (pendingRef.current) {
          setMap(pendingRef.current);
          pendingRef.current = null;
        }
      }, THROTTLE_MS);
    }

    function applyChange(payload: {
      eventType: "INSERT" | "UPDATE" | "DELETE";
      new: ReservationRow | Record<string, never>;
      old: ReservationRow | Record<string, never>;
    }) {
      // map snapshot — pendingRef hat Vorrang weil noch nicht geflushed
      const baseMap = pendingRef.current ?? map;
      const next: ReservationMap = { ...baseMap };
      if (payload.eventType === "DELETE") {
        const oldRow = payload.old as ReservationRow;
        if (oldRow && oldRow.bestellung_id) {
          delete next[oldRow.bestellung_id];
        }
      } else {
        const row = payload.new as ReservationRow;
        if (row && row.bestellung_id) {
          next[row.bestellung_id] = {
            bestellung_id: row.bestellung_id,
            user_kuerzel: row.user_kuerzel,
            user_name: row.user_name,
            expires_at: row.expires_at,
          };
        }
      }
      scheduleFlush(next);
    }

    channel = supabase
      .channel("pool-reservations-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pool_reservations" },
        (payload) =>
          applyChange({
            eventType: payload.eventType as "INSERT" | "UPDATE" | "DELETE",
            new: (payload.new ?? {}) as ReservationRow | Record<string, never>,
            old: (payload.old ?? {}) as ReservationRow | Record<string, never>,
          }),
      )
      .subscribe();

    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- map ist Ref-Quelle
  }, []);

  return map;
}
