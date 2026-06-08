import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { PageHero } from "@/components/ui/page-hero";
import { LaneNav } from "@/components/bestellungen/lane-nav";
import { CmdKSearchTrigger } from "@/components/bestellungen/cmdk-search";
import { loadLaneDataSafe } from "@/lib/bestellungen-lane-loader";

// 03.06.2026 — Edge-Runtime auskommentiert nach Pool-Lane-Crash auf Production.
// Sub-Queries (vw_user_*_affinity, firma_einstellungen) hatten möglicherweise
// Edge-Compatibility-Issue. Node-Runtime ist stabil — bei Bedarf später wieder
// auf Edge testen.
// export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Workspace-Layout (UX-R2, 03.06.2026) — gemeinsamer Rahmen für die drei
 * Bestellungen-Lanes (`/bestellungen/pool`, `/in-arbeit`, `/archiv`).
 *
 * Rendert die editorial PageHero ("Posteingang · Bestellungen") plus die
 * LaneNav mit Live-Counts aus loadLaneData. Children sind die jeweilige
 * Lane-Page mit ArtFilterChips + Body.
 *
 * **Counts** werden hier geladen, nicht in jeder Lane-Page einzeln — sie
 * sind Lane-global und konstant pro Render. `loadLaneData` mit Lane="pool"
 * als Trigger liefert immer alle 3 Counts. Die Lane-Pages laden ihre
 * eigenen Daten parallel (Layouts + Pages werden gestreamt).
 *
 * **Aktive Lane:** Die LaneNav nutzt selber usePathname() — Layout muss
 * keinen aktiven Lane-Param durchreichen.
 *
 * Route-Group `(workspace)` ist URL-transparent — die URLs bleiben
 * `/bestellungen/pool`, `/bestellungen/in-arbeit`, `/bestellungen/archiv`.
 * Detail-Page `/bestellungen/[id]` liegt außerhalb der Gruppe und behält
 * ihr eigenes Layout.
 */
export default async function BestellungenWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profil = await getBenutzerProfil();
  const supabase = await createServerSupabaseClient();

  // 03.06.2026 — `loadLaneDataSafe` wirft NIE, gibt im Crash-Case einen
  // emptyLaneResult zurück. Layout + LaneNav (mit 0-counts) bleiben sichtbar.
  const data = await loadLaneDataSafe(supabase, { lane: "pool" }, profil);
  const counts = data.counts;

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Posteingang"
        title="Bestellungen"
        description="Pool für gemeinsame Triage, persönliche Lane für aktive Aufgaben, Archiv für Erledigtes. Cmd+K für lane-übergreifende Suche."
        marks
        actions={<CmdKSearchTrigger />}
      />
      <LaneNav counts={counts} />
      {children}
    </div>
  );
}
