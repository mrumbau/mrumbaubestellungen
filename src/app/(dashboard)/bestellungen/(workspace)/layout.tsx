import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { PageHero } from "@/components/ui/page-hero";
import { LaneNav } from "@/components/bestellungen/lane-nav";
import { CmdKSearchTrigger } from "@/components/bestellungen/cmdk-search";
import { loadLaneData } from "@/lib/bestellungen-lane-loader";

export const runtime = "edge";
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

  // Counts laden — eine Lane reicht, loadLaneData liefert immer alle 3.
  const data = await loadLaneData(supabase, { lane: "pool" }, profil);

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        eyebrow="Posteingang"
        title="Bestellungen"
        description="Pool für gemeinsame Triage, persönliche Lane für aktive Aufgaben, Archiv für Erledigtes. Cmd+K für lane-übergreifende Suche."
        marks
        actions={<CmdKSearchTrigger />}
      />
      <LaneNav counts={data.counts} />
      {children}
    </div>
  );
}
