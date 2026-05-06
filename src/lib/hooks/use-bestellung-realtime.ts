"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";

/**
 * Realtime-Hook: abonniert Postgres-Changes auf einer einzelnen Bestellung
 * (oder ALL bestellungen wenn id=null) und triggert router.refresh() wenn
 * die Bestellung extern geändert wird (z.B. Pipeline-Update via Cron, oder
 * Status-Wechsel durch anderen User).
 *
 * 06.05.2026 — Welle 3 Frontend-Adoption.
 *
 * Voraussetzung: bestellungen-Tabelle ist in supabase_realtime-Publication
 * (siehe Migration "welle3_materialized_views_kpis").
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
            // Default: Server-Component refreshen — Bestellung wird neu vom Server geladen
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
