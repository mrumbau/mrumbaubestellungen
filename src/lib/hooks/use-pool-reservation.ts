"use client";

/**
 * useDrawerReservation — Soft-Reserve-Lifecycle für den Pool-Quick-Drawer.
 *
 * 03.06.2026 (Pool 2.0 Sprint 2):
 *   1. Wenn der Drawer für `bestellungId` 1.5s lang offen ist (Stability-
 *      Probe gegen schnelles Scrollen durch Pool-Cards) → Reserve setzen
 *      (source='drawer_open').
 *   2. Solange der Drawer offen ist, refresh alle 4 Minuten.
 *   3. Beim Schließen: Release via fetch.
 *   4. Beim Tab/Browser-Close: `navigator.sendBeacon` als best-effort Cleanup
 *      (Backup-Cron `pool_reservation_expire` cleant nach TTL ab).
 *
 * Reserve ist Awareness, kein Lock — auch wenn die Reserve fehlschlägt
 * (z. B. andere User hat reserviert), bleibt der Pool-Workflow erlaubt.
 * Der Hook liefert den `holder`-State an die UI damit der Drawer die
 * ReserveBadge "CR bearbeitet · 9:42" anzeigen kann.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const STABILITY_DELAY_MS = 1500;
const REFRESH_INTERVAL_MS = 4 * 60 * 1000;
const SOURCE: "drawer_open" = "drawer_open";

export interface ReservationHolder {
  kuerzel: string;
  name: string;
  expiresAtIso: string;
}

export interface UsePoolReservationOptions {
  bestellungId: string | null;
  /** Sobald false → Release. Default true wenn bestellungId gesetzt. */
  enabled?: boolean;
}

export interface UsePoolReservationResult {
  /** Wir halten die Reserve (TTL-aktiv). */
  isOwnReservation: boolean;
  /** Wenn jemand anderes (oder niemand wegen Race) reserviert hat. */
  otherHolder: ReservationHolder | null;
  /** Eigene Ablauf-Zeit. */
  ownExpiresAtIso: string | null;
}

interface RpcResponseSuccess {
  success: true;
  expires_at: string;
  refreshed?: boolean;
  stole_from_expired?: string;
}

interface RpcResponseConflict {
  success: false;
  error: "andere_reservierung";
  current_holder: { kuerzel: string; name: string; expires_at: string };
}

interface RpcResponseError {
  success: false;
  error: string;
  current_holder?: { kuerzel: string; name: string; expires_at: string };
}

type RpcResponse = RpcResponseSuccess | RpcResponseConflict | RpcResponseError;

export function usePoolReservation({
  bestellungId,
  enabled = true,
}: UsePoolReservationOptions): UsePoolReservationResult {
  const [isOwn, setIsOwn] = useState(false);
  const [ownExpires, setOwnExpires] = useState<string | null>(null);
  const [other, setOther] = useState<ReservationHolder | null>(null);

  // Refs für Timer-Cleanup. Wir tracken auch die aktive `bestellungId` um
  // beim sendBeacon-Listener die richtige zu erwischen.
  const stabilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeIdRef = useRef<string | null>(null);

  const reserve = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/bestellungen/${id}/pool-reserve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: SOURCE }),
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => ({}))) as RpcResponse;
      if (json.success) {
        setIsOwn(true);
        setOwnExpires(json.expires_at);
        setOther(null);
      } else if (json.error === "andere_reservierung" && json.current_holder) {
        setIsOwn(false);
        setOwnExpires(null);
        setOther({
          kuerzel: json.current_holder.kuerzel,
          name: json.current_holder.name,
          expiresAtIso: json.current_holder.expires_at,
        });
      } else {
        // Andere Fehler (keine_berechtigung, nicht_authentifiziert): silent.
        // Reserve ist optionales Awareness-Feature, kein Blocker für den
        // Workflow.
        setIsOwn(false);
        setOwnExpires(null);
      }
    } catch {
      // Network errors silent — Hook ist best-effort
    }
  }, []);

  const release = useCallback(async (id: string, useBeacon: boolean) => {
    if (useBeacon && typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      // sendBeacon liefert KEINE Promise → fire-and-forget für Tab-Close
      const blob = new Blob([JSON.stringify({})], { type: "application/json;charset=UTF-8" });
      navigator.sendBeacon(`/api/bestellungen/${id}/pool-release-reservation`, blob);
      return;
    }
    try {
      await fetch(`/api/bestellungen/${id}/pool-release-reservation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "same-origin",
        keepalive: true,
      });
    } catch {
      // ignore
    }
  }, []);

  // Lifecycle: bei bestellungId-Change oder enabled-Switch starten/stoppen
  useEffect(() => {
    if (!enabled || !bestellungId) {
      // Release vorherige aktive Reserve falls vorhanden
      const prior = activeIdRef.current;
      if (prior) {
        release(prior, false);
      }
      activeIdRef.current = null;
      setIsOwn(false);
      setOwnExpires(null);
      setOther(null);
      if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current);
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      return;
    }

    // Neuer Drawer öffnet → Reserve nach Stabilitätsdelay
    activeIdRef.current = bestellungId;
    stabilityTimerRef.current = setTimeout(() => {
      const id = activeIdRef.current;
      if (id !== bestellungId) return; // raced
      reserve(bestellungId);
      // Periodischer Refresh alle 4min
      refreshTimerRef.current = setInterval(() => {
        const id2 = activeIdRef.current;
        if (id2) reserve(id2);
      }, REFRESH_INTERVAL_MS);
    }, STABILITY_DELAY_MS);

    return () => {
      if (stabilityTimerRef.current) clearTimeout(stabilityTimerRef.current);
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [bestellungId, enabled, reserve, release]);

  // Tab-Close: sendBeacon Cleanup
  useEffect(() => {
    function onVisibilityHidden() {
      if (document.visibilityState === "hidden") {
        const id = activeIdRef.current;
        if (id) release(id, true);
      }
    }
    function onPageHide() {
      const id = activeIdRef.current;
      if (id) release(id, true);
    }
    document.addEventListener("visibilitychange", onVisibilityHidden);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityHidden);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [release]);

  return {
    isOwnReservation: isOwn,
    otherHolder: other,
    ownExpiresAtIso: ownExpires,
  };
}
