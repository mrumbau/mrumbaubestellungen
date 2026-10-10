import { getBenutzerProfil } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { LaneNav } from "@/components/bestellungen/lane-nav";
import { CmdKSearchTrigger } from "@/components/bestellungen/cmdk-search";
import { ladeLaneZaehler } from "@/lib/bestellungen-lane-loader";

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
 * Rendert die editorial PageHeader ("Posteingang · Bestellungen") plus die
 * LaneNav mit Live-Counts aus loadLaneData. Children sind die jeweilige
 * Lane-Page mit ArtFilterChips + Body.
 *
 * **Counts** kommen aus `ladeLaneZaehler` — drei Count-Abfragen, per React
 * `cache` einmal pro Request. Die Lane-Page ruft dieselbe Funktion ueber
 * `loadLaneData` auf und bekommt das gleiche Ergebnis, ohne zweite Abfrage.
 * Bis 10.10.2026 hat das Layout hier die komplette Pool-Lane geladen, nur
 * um an die Zahlen zu kommen; die Pool-Seite lud sie danach noch einmal.
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
  const counts = await ladeLaneZaehler(profil?.kuerzel ?? null, profil?.rolle ?? null, null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Posteingang"
        title="Bestellungen"
        actions={<CmdKSearchTrigger />}
      />
      <LaneNav counts={counts} />
      {children}
    </div>
  );
}
