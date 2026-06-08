import Link from "next/link";
import { getBenutzerProfil } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { LaneWorkspace } from "@/components/bestellungen/lane-workspace";
import { loadLaneData, HARD_CAP } from "@/lib/bestellungen-lane-loader";

// Edge-Runtime testweise raus — siehe layout.tsx Begründung.
export const dynamic = "force-dynamic";

/**
 * Pool-Lane (UX-R2, 03.06.2026) — die kollaborative Triage-Inbox.
 *
 * 03.06.2026 — Defensive Try-Catch + ?debug=minimal Bypass für die
 * Diagnose. Bei ?debug=minimal rendert die Page nur eine simple Liste
 * der Pool-Items ohne LaneWorkspace/BestellungenTabelle. Falls die
 * minimal-Variante funktioniert aber der Default-Render crasht, wissen
 * wir der Bug ist in LaneWorkspace/BestellungenTabelle.
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

    // Diagnose-Bypass: ?debug=minimal rendert eine simple Liste ohne
    // LaneWorkspace/BestellungenTabelle. Wenn diese Variante geht, ist
    // der Bug in einem Sub-Component.
    if (params.debug === "minimal") {
      return (
        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-success-border bg-success-bg px-4 py-2 text-meta text-success">
            ✓ loadLaneData OK — {data.bestellungen.length} Pool-Items geladen.
          </div>
          <ul className="flex flex-col gap-1.5">
            {data.bestellungen.slice(0, 50).map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-3 p-3 rounded-md border border-line bg-surface"
              >
                <Link
                  href={`/bestellungen/${b.id}`}
                  className="flex-1 min-w-0 truncate font-mono-amount text-body-sm text-brand hover:text-brand-light"
                >
                  {b.bestellnummer ?? "Ohne Nr."} · {b.haendler_name ?? "—"}
                </Link>
                <span className="text-meta text-foreground-subtle whitespace-nowrap">
                  {b.betrag != null
                    ? `${Number(b.betrag).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`
                    : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    }

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
