"use client";

/**
 * useDrawerStack — Drawer-Open-State mit URL-Sync.
 *
 * 03.06.2026 (Pool 2.0 Sprint 1): Drawer ist die Default-Interaktion mit
 * Pool-Items. Damit Browser-Back den Drawer schließt (und nicht direkt
 * die Page verlässt), syncen wir den State in einen URL-Search-Param.
 * Reload auf einer Drawer-URL öffnet den Drawer wieder.
 *
 * Vertrag:
 *   - URL-Pattern: `?drawer=<id>`
 *   - Konflikt-frei mit anderen searchParams (preserved)
 *   - replace() statt push() — Drawer-Open zählt nicht als History-Entry
 *     ABER Drawer-Close kommt aus Browser-Back natürlich (popstate)
 *   - Nur ein Drawer aktiv (Stack-Modell ist Single-Slot)
 *
 * Returns:
 *   - drawerId: aktuelle ID aus URL oder null
 *   - openDrawer(id): setzt ?drawer=id
 *   - closeDrawer(): entfernt ?drawer
 *   - isOpen(id): convenience-check für einzelne Karten
 */

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

const PARAM = "drawer";

export interface DrawerStackApi {
  drawerId: string | null;
  isOpen: (id: string) => boolean;
  openDrawer: (id: string) => void;
  closeDrawer: () => void;
}

export function useDrawerStack(): DrawerStackApi {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const drawerId = searchParams.get(PARAM);

  const writeParam = useCallback(
    (next: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next == null) {
        params.delete(PARAM);
      } else {
        params.set(PARAM, next);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const openDrawer = useCallback((id: string) => writeParam(id), [writeParam]);
  const closeDrawer = useCallback(() => writeParam(null), [writeParam]);
  const isOpen = useCallback((id: string) => drawerId === id, [drawerId]);

  return { drawerId, isOpen, openDrawer, closeDrawer };
}
