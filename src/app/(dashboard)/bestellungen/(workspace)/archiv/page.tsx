import { getBenutzerProfil } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { LaneWorkspace } from "@/components/bestellungen/lane-workspace";
import { LaneEmptyState } from "@/components/bestellungen/lane-empty-state";
import { loadLaneDataSafe, HARD_CAP } from "@/lib/bestellungen-lane-loader";

export const dynamic = "force-dynamic";

/**
 * Archiv-Lane (UX-R2) — Erledigtes.
 * Gleiche Stabilitäts-Strategie wie Pool-Page.
 */
export default async function ArchivLanePage({
  searchParams,
}: {
  searchParams: Promise<{ projekt_id?: string; art?: string; owner?: string }>;
}) {
  const params = await searchParams;

  try {
    const profil = await getBenutzerProfil();
    const supabase = await createServerSupabaseClient();

    const data = await loadLaneDataSafe(
      supabase,
      {
        lane: "archiv",
        art: params.art,
        projektId: params.projekt_id,
        owner: params.owner,
      },
      profil,
    );

    const bestellungenCount = data.bestellungen?.length ?? 0;

    return (
      <>
        {data.reachedCap && (
          <div className="rounded-md border border-warning-border bg-warning-bg px-4 py-2 text-meta text-warning">
            Hard-Cap von {HARD_CAP} Bestellungen erreicht. Älteste Einträge werden nicht angezeigt.
          </div>
        )}
        {bestellungenCount === 0 ? (
          <LaneEmptyState lane="archiv" />
        ) : (
          <LaneWorkspace
            lane="archiv"
            data={data}
            profil={profil}
            isAdmin={profil?.rolle === "admin"}
            projektId={params.projekt_id}
          />
        )}
      </>
    );
  } catch (err) {
    return <LanePageCrashFallback err={err} laneLabel="Archiv" />;
  }
}

function LanePageCrashFallback({
  err,
  laneLabel,
}: {
  err: unknown;
  laneLabel: string;
}) {
  const msg = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  // eslint-disable-next-line no-console
  console.error(`[archiv/page] crash:`, { msg, stack });

  return (
    <div className="rounded-md border border-error-border bg-error-bg p-4">
      <div className="text-meta font-semibold uppercase tracking-[0.14em] text-error mb-2">
        {laneLabel} konnte nicht geladen werden
      </div>
      <p className="text-body-sm text-foreground mb-3">
        Server-Render-Error. Layout und LaneNav funktionieren — der Body crasht.
      </p>
      <details className="text-meta text-foreground-muted" open>
        <summary className="cursor-pointer font-semibold text-foreground hover:text-brand transition-colors">
          Stack-Trace
        </summary>
        <pre className="mt-2 p-3 rounded-md bg-canvas border border-line text-eyebrow text-foreground-muted overflow-auto max-h-96 whitespace-pre-wrap break-words">
          {msg}
          {stack ? `\n\n${stack}` : ""}
        </pre>
      </details>
    </div>
  );
}
