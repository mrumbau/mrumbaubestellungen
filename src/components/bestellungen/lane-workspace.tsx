/**
 * LaneWorkspace — Server-Component die für eine Lane die richtige Body-DNA
 * rendert (UX-R2, 03.06.2026).
 *
 * Single-Source-of-Truth: alle 3 Lane-Pages (`/pool`, `/in-arbeit`, `/archiv`)
 * rufen `loadLaneData` und reichen das Result hier rein. Diese Shell:
 *   - rendert ArtFilterChips (außer Pool, wo nur Material relevant ist)
 *   - mapt Lane → Scope (Legacy-Kompat) für die BestellungenTabelle
 *   - reicht Pool-Sprint-2/3-Daten nur in der Pool-Lane durch
 *
 * Sie ersetzt die alte monolithische `page.tsx`, die 4 Scopes in einer
 * Datei jonglierte. Pro Lane ist jetzt klar, was wie gerendert wird.
 */

import { BestellungenTabelle } from "@/components/bestellungen-tabelle";
import { ArtFilterChips } from "@/components/bestellungen/art-filter-chips";
// 03.06.2026 — Server-safe Pure-Helpers aus /lib/bestellungen-art.ts.
// art-filter-chips.tsx ist "use client" und darf vom Server nur als
// JSX-Komponente verwendet werden, nicht für const/function-Imports.
import {
  ALL_BESTELLUNGSARTEN,
  type Bestellungsart,
} from "@/lib/bestellungen-art";
import type { Lane } from "@/components/bestellungen/lane-config";
import type { LaneLoadResult, UserProfil } from "@/lib/bestellungen-lane-loader";

interface LaneWorkspaceProps {
  lane: Lane;
  data: LaneLoadResult;
  profil: UserProfil | null;
  isAdmin: boolean;
  /** ?projekt_id=... URL-Param, falls aktiv. */
  projektId?: string | null;
}

/**
 * Mappt die neue Lane auf den Legacy-Scope-Wert, den `BestellungenTabelle`
 * intern für `useTableFilters({defaultStatusFilter})` braucht.
 *
 *   pool       → "pool"        (Status-Default "offen" / Inbox-Layout)
 *   in-arbeit  → "mine-open"   (Status-Default "offen")
 *   archiv     → "mine-done"   (Status-Default "" — Server gibt schon
 *                               terminal-Stati zurück, Client filtert nicht
 *                               künstlich auf "offen")
 */
function laneToLegacyScope(lane: Lane): "pool" | "mine-open" | "mine-done" {
  if (lane === "pool") return "pool";
  if (lane === "archiv") return "mine-done";
  return "mine-open";
}

export function LaneWorkspace({
  lane,
  data,
  profil,
  isAdmin,
  projektId,
}: LaneWorkspaceProps) {
  // Pro Lane wird das Chip-Inventory definiert.
  //   - pool: nur Material (Pool ist per Definition material-only).
  //   - in-arbeit / archiv: alle 3 Arten erlauben.
  const visibleArten: ReadonlyArray<Bestellungsart> =
    lane === "pool" ? ["material"] : ALL_BESTELLUNGSARTEN;

  // Pool-Chip-Count = nur material-Bestellungen aktuell in der Lane.
  // Für In-Arbeit/Archiv: pro Bestellungsart zählen über die geladenen
  // Bestellungen (Server hat schon nach Lane gefiltert).
  const chipCounts: Record<Bestellungsart, number> = {
    material: 0,
    subunternehmer: 0,
    abo: 0,
  };
  for (const b of data.bestellungen) {
    const art = (b.bestellungsart || "material") as Bestellungsart;
    if (art in chipCounts) chipCounts[art]++;
  }

  const scope = laneToLegacyScope(lane);
  const poolLayout = lane === "pool" ? "inbox" : "table";

  return (
    <div className="flex flex-col gap-4">
      {/* Quick-Filter-Chips. Pool zeigt nur "Material" (per Definition).
          In-Arbeit/Archiv zeigen alle 3 Arten zum Drilldown. */}
      <ArtFilterChips counts={chipCounts} visibleArten={visibleArten} />

      <BestellungenTabelle
        bestellungen={data.bestellungen}
        projekte={data.projekte}
        aktiverProjektFilter={projektId || null}
        aktiverProjektName={data.aktiverProjektName}
        isAdmin={isAdmin}
        scope={scope}
        profil={
          profil
            ? { kuerzel: profil.kuerzel, rolle: profil.rolle, name: profil.name }
            : null
        }
        bestellerOptions={data.bestellerOptions}
        poolLayout={poolLayout}
        poolUserStateById={data.poolUserStateById}
        poolReservationsById={data.poolReservationsById}
        vendorDomainById={data.vendorDomainById}
        haendlerIdByBestellungId={data.haendlerIdByBestellungId}
        isAutoClaimedById={data.isAutoClaimedById}
        scoreWeights={data.scoreWeights}
        vendorAffinity={data.vendorAffinity}
        projektAffinity={data.projektAffinity}
        scoreTopXThreshold={data.scoreTopXThreshold}
        embedded
      />
    </div>
  );
}
