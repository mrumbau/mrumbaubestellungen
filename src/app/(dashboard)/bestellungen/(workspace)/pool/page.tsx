import { getBenutzerProfil } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { LaneWorkspace } from "@/components/bestellungen/lane-workspace";
import { loadLaneData, HARD_CAP } from "@/lib/bestellungen-lane-loader";

// Edge-Runtime testweise raus — siehe layout.tsx Begründung.
export const dynamic = "force-dynamic";

/**
 * Pool-Lane (UX-R2, 03.06.2026) — die kollaborative Triage-Inbox.
 *
 * 03.06.2026 — Defensive Try-Catch um loadLaneData + LaneWorkspace damit
 * ein Server-Render-Error nicht silent zu error.tsx eskaliert. Statt
 * dessen rendert der Pool eine Fallback-UI mit dem echten Stack-Trace
 * (auch in production), damit wir die Ursache sehen können.
 */
export default async function PoolLanePage({
  searchParams,
}: {
  searchParams: Promise<{ projekt_id?: string; art?: string; debug?: string }>;
}) {
  const params = await searchParams;

  try {
    const profil = await getBenutzerProfil();
    const supabase = await createServerSupabaseClient();

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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    // eslint-disable-next-line no-console
    console.error("[pool/page] crash in loadLaneData/LaneWorkspace:", { msg, stack });

    return (
      <div className="rounded-md border border-error-border bg-error-bg p-4">
        <div className="text-meta font-semibold uppercase tracking-[0.14em] text-error mb-2">
          Pool-Lane konnte nicht geladen werden
        </div>
        <p className="text-body-sm text-foreground mb-3">
          Server-Render-Error in der Pool-Lane. Layout und LaneNav funktionieren — die Daten-Query crasht.
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
}
