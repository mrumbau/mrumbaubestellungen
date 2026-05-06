"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";

/**
 * Realtime-Hook: abonniert Postgres-Changes auf einer einzelnen Bestellung
 * und triggert router.refresh() wenn extern geändert (Pipeline/Cron/anderer User).
 *
 * 06.05.2026 — Welle 3 Frontend-Adoption.
 */
export function useBestellungRealtime(
  bestellungId: string | null,
  options?: { onUpdate?: () => void },
) {
  const router = useRouter();

  useEffect(() => {
    if (!bestellungId) return;

    const supabase = createBrowserSupabaseClient();

    const channel = supabase
      .channel(`bestellung-${bestellungId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bestellungen",
          filter: `id=eq.${bestellungId}`,
        },
        () => {
          if (options?.onUpdate) {
            options.onUpdate();
          } else {
            router.refresh();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [bestellungId, router, options]);
}

/**
 * 06.05.2026 (Welle 4) — Realtime-Hook für die Bestellungen-Liste.
 *
 * Abonniert ALLE INSERT/UPDATE/DELETE-Events auf bestellungen, triggert
 * router.refresh() (= Server-Component lädt neue Daten). Mit Debounce damit
 * bei Backfill-Bursts (cron-getriggerte Massen-Updates) die UI nicht im
 * Sekunden-Takt rerendert.
 */
export function useBestellungenListRealtime(options?: {
  debounceMs?: number;
  onChange?: () => void;
}) {
  const router = useRouter();
  const debounceMs = options?.debounceMs ?? 1500;

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const triggerRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (options?.onChange) options.onChange();
        else router.refresh();
      }, debounceMs);
    };

    const channel = supabase
      .channel("bestellungen-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bestellungen" },
        triggerRefresh,
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router, debounceMs, options]);
}
