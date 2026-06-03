import { getBenutzerProfil } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { LaneWorkspace } from "@/components/bestellungen/lane-workspace";
import { loadLaneData, HARD_CAP } from "@/lib/bestellungen-lane-loader";

// Edge-Runtime testweise raus — siehe layout.tsx Begründung.
export const dynamic = "force-dynamic";

/**
 * Pool-Lane (UX-R2, 03.06.2026) — die kollaborative Triage-Inbox.
 *
 * Zeigt UNBEKANNT-Material-Bestellungen. Beide Besteller (MT, CR) plus Admin
 * (MH) sehen den Pool. Layout-DNA = Inbox (Card-Feed mit Vendor-Hero, Score,
 * Reserve, Read-Dot, Aging-Wash). Click öffnet PoolQuickDrawer.
 *
 * Server-Filter: `besteller_kuerzel='UNBEKANNT' AND bestellungsart='material'`
 * Client-Filter: Suche + Status (über die FilterBar in der BestellungenTabelle).
 * URL-Params: `?art=material` (Pool ist eh material-only, der Chip dient nur
 * der Konsistenz), `?projekt_id=...`.
 */
export default async function PoolLanePage({
  searchParams,
}: {
  searchParams: Promise<{ projekt_id?: string; art?: string }>;
}) {
  const profil = await getBenutzerProfil();
  const supabase = await createServerSupabaseClient();
  const params = await searchParams;

  const data = await loadLaneData(
    supabase,
    {
      lane: "pool",
      art: params.art,
      projektId: params.projekt_id,
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
        lane="pool"
        data={data}
        profil={profil}
        isAdmin={profil?.rolle === "admin"}
        projektId={params.projekt_id}
      />
    </>
  );
}
