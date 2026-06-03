import { getBenutzerProfil } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { LaneWorkspace } from "@/components/bestellungen/lane-workspace";
import { loadLaneData, HARD_CAP } from "@/lib/bestellungen-lane-loader";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * In-Arbeit-Lane (UX-R2, 03.06.2026) — persönliche aktive Bestellungen.
 *
 * Besteller sieht eigene + Abo/SU mit Status ≠ freigegeben/verworfen/storniert.
 * Admin sieht standardmäßig nur eigene; mit `?owner=alle` Übersicht über alle
 * Besteller (deckt den heutigen "Alle"-Tab ab, mit Owner-Spalte als Drilldown).
 *
 * Layout-DNA = Tabelle (dichte DataTable, Bulk-Edit, Sortierung, Saved-Views,
 * CSV-Export). Art (Material/SU/Abo) als Quick-Filter-Chip im Outer-Workspace.
 */
export default async function InArbeitLanePage({
  searchParams,
}: {
  searchParams: Promise<{ projekt_id?: string; art?: string; owner?: string }>;
}) {
  const profil = await getBenutzerProfil();
  const supabase = await createServerSupabaseClient();
  const params = await searchParams;

  const data = await loadLaneData(
    supabase,
    {
      lane: "in-arbeit",
      art: params.art,
      projektId: params.projekt_id,
      owner: params.owner,
    },
    profil,
  );

  return (
    <>
      {data.reachedCap && (
        <div className="rounded-md border border-warning-border bg-warning-bg px-4 py-2 text-meta text-warning">
          Hard-Cap von {HARD_CAP} Bestellungen erreicht. Älteste Einträge werden nicht angezeigt.
        </div>
      )}
      <LaneWorkspace
        lane="in-arbeit"
        data={data}
        profil={profil}
        isAdmin={profil?.rolle === "admin"}
        projektId={params.projekt_id}
      />
    </>
  );
}
