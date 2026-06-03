import { getBenutzerProfil } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { LaneWorkspace } from "@/components/bestellungen/lane-workspace";
import { loadLaneData, HARD_CAP } from "@/lib/bestellungen-lane-loader";

// Edge-Runtime testweise raus — siehe layout.tsx Begründung.
export const dynamic = "force-dynamic";

/**
 * Archiv-Lane (UX-R2, 03.06.2026) — Erledigtes.
 *
 * Besteller sieht eigene + Abo/SU mit Status ∈ (freigegeben, verworfen,
 * storniert). Admin sieht alle freigegebenen/verworfenen/stornierten. Layout-
 * DNA = Tabelle (gleiche DNA wie In-Arbeit) + CSV-Export für die Buchhaltung
 * via SavedViews-Menu.
 *
 * Ersetzt die alte `mine-done`-Scope und schließt zusätzlich verworfene/
 * stornierte Bestellungen ein — Archiv ist Endzustand, nicht nur Freigegeben.
 */
export default async function ArchivLanePage({
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
      lane: "archiv",
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
        lane="archiv"
        data={data}
        profil={profil}
        isAdmin={profil?.rolle === "admin"}
        projektId={params.projekt_id}
      />
    </>
  );
}
