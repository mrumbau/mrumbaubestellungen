"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";

/**
 * Realtime-Hook: abonniert Postgres-Changes auf einer einzelnen Bestellung
 * UND auf events der Bestellung. Triggert router.refresh() wenn extern
 * geändert (Pipeline/Cron/anderer User) oder neues Audit-Event eintrifft.
 *
 * 06.05.2026 — Welle 3 Frontend-Adoption.
 * 06.05.2026 — Welle 4 erweitert um events-Subscription für Live-Audit-Trail.
 */
export function useBestellungRealtime(
  bestellungId: string | null,
  options?: { onUpdate?: () => void },
) {
  const router = useRouter();

  useEffect(() => {
    if (!bestellungId) return;

    const supabase = createBrowserSupabaseClient();

    const trigger = () => {
      if (options?.onUpdate) options.onUpdate();
      else router.refresh();
    };

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
        trigger,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "events",
          filter: `entity_id=eq.${bestellungId}`,
        },
        trigger,
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
 *
 * 11.05.2026 — zusätzlich events INSERT (entity_type='bestellung'). Damit die
 * Audit-Trail-Spalte (event_count) live aktualisiert wird auch wenn das Event
 * nichts auf bestellungen ändert (z.B. Kommentare, Doku-Adds). Beide Subscriptions
 * teilen denselben Debounce — ein Burst aus bestellungs-UPDATE + zugehörigem
 * event-INSERT triggert nur ein Refresh.
 *
 * 22.05.2026 (Perf Stufe 2.5) — Debounce-Default 1500 → 800ms reduziert.
 * Hintergrund: explizite `router.refresh()` in den Bulk-Action-Handlern wurden
 * entfernt — Realtime ist jetzt der einzige Sync-Pfad. 800ms ist der Kompromiss
 * zwischen "schnelles Sync nach Single-Action" und "ein Refresh bei Burst-Updates
 * vom Backfill-Cron statt 30 Refreshes". Bulk-Success-Flash-Animation läuft 1300ms,
 * Refresh kommt jetzt mit ~800ms — User sieht ~500ms Flash bevor Row aus dem
 * Filter fällt (Status-Wechsel offen → freigegeben). Akzeptiert als Trade.
 */
export function useBestellungenListRealtime(options?: {
  debounceMs?: number;
  onChange?: () => void;
}) {
  const router = useRouter();
  const debounceMs = options?.debounceMs ?? 800;

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
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "events",
          filter: "entity_type=eq.bestellung",
        },
        triggerRefresh,
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router, debounceMs, options]);
}
