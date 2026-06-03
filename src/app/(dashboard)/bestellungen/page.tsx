import { redirect } from "next/navigation";
import {
  defaultLaneForRolle,
  laneFromLegacyView,
} from "@/components/bestellungen/lane-config";
import { getBenutzerProfil } from "@/lib/auth";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * /bestellungen — Legacy-Redirect-Hub (UX-R2, 03.06.2026).
 *
 * Die alte Monolith-Page wurde durch drei Lane-Routes ersetzt
 * (`/bestellungen/pool`, `/in-arbeit`, `/archiv`). Diese Datei mapt:
 *
 *   - `/bestellungen` ohne Param → default-Lane je Rolle (Pool für alle).
 *   - `?view=pool`               → `/bestellungen/pool`
 *   - `?view=mine-open`          → `/bestellungen/in-arbeit`
 *   - `?view=mine-done`          → `/bestellungen/archiv`
 *   - `?view=all`                → `/bestellungen/in-arbeit?owner=alle`
 *
 * Zusätzliche Params (`projekt_id`, `art`, …) werden durchgereicht.
 * Bookmarks und externe Links auf alte URLs funktionieren so weiter.
 */
export default async function BestellungenRootPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const profil = await getBenutzerProfil();
  const params = await searchParams;
  const view = typeof params.view === "string" ? params.view : null;

  const { lane, extraParams } = view
    ? laneFromLegacyView(view)
    : { lane: defaultLaneForRolle(profil?.rolle), extraParams: undefined };

  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === "view" || !v) continue;
    search.set(k, v);
  }
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) search.set(k, v);
  }
  const qs = search.toString();
  redirect(`/bestellungen/${lane}${qs ? `?${qs}` : ""}`);
}
