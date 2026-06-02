/**
 * PoolHeroCard — Dashboard-Bento-Card für Pool-Stats.
 *
 * Pool-Phase-6 (02.06.2026). Asymmetrische Hero-Card (md:col-span-2) mit drei
 * Informations-Schichten:
 *   1. **Anzahl** — wie viele Material-Bestellungen liegen ohne Owner.
 *   2. **Ältester-Eintrag-Alter** — sozialer Druck ohne Mahn-Mail-Spam.
 *   3. **Top-3-Vendoren-Mini-Histogramm** — zeigt wo der Pool sich konzentriert.
 *
 * Drei-Sprachen-Disziplin: Pool ist KEIN Status, daher kein Status-Token.
 * Brand-Akzent als Anker (links border-top wie HeroStatCard, Mini-Bars in
 * gedimmtem Brand-Tint). Bewusst KEIN Pulse, KEIN identical-card-grid-Anti-
 * Pattern (impeccable).
 *
 * Pure Server-Component — lädt eigene Daten via createServerSupabaseClient.
 * RLS scoped korrekt: Besteller/Admin sehen Pool, Buchhaltung wird in der
 * Page nicht zum Dashboard durchgelassen.
 */

import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";

interface VendorBucket {
  haendler: string;
  count: number;
}

const TOP_N = 3;

export async function PoolHeroCard() {
  const supabase = await createServerSupabaseClient();

  // Pool-Items + Top-Vendoren in einem Roundtrip
  const { data: poolItems } = await supabase
    .from("bestellungen")
    .select("id, haendler_name, created_at")
    .eq("besteller_kuerzel", "UNBEKANNT")
    .eq("bestellungsart", "material")
    .neq("status", "freigegeben")
    .is("archiviert_am", null)
    .order("created_at", { ascending: true });

  const items = poolItems ?? [];
  const count = items.length;

  if (count === 0) {
    return null; // Kein leerer Pool → keine Card, kein visueller Lärm
  }

  // Ältester Eintrag (älteste created_at)
  const oldestIso = items[0]?.created_at ?? null;
  const oldestDays = oldestIso
    ? Math.floor((Date.now() - new Date(oldestIso).getTime()) / (24 * 60 * 60 * 1000))
    : 0;
  const oldestLabel =
    oldestDays === 0 ? "heute" : oldestDays === 1 ? "1 Tag" : `${oldestDays} Tage`;

  // Top-3-Vendoren (case-insensitive Haendler-Gruppierung)
  const buckets = new Map<string, number>();
  for (const it of items) {
    const haendler = (it.haendler_name ?? "Unbekannt").trim() || "Unbekannt";
    buckets.set(haendler, (buckets.get(haendler) ?? 0) + 1);
  }
  const topVendors: VendorBucket[] = [...buckets.entries()]
    .map(([haendler, count]) => ({ haendler, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N);
  const topMax = topVendors[0]?.count ?? 1;

  return (
    <Link
      href="/bestellungen?view=pool"
      prefetch={false}
      className="card card-hover relative overflow-hidden md:col-span-2 group focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] rounded-[var(--radius-lg)]"
      style={{ borderTop: "3px solid var(--mr-red)" }}
      aria-label={`Pool: ${count} Bestellungen ohne Besteller, ältester Eintrag ${oldestLabel} alt`}
    >
      <div
        aria-hidden="true"
        className="absolute top-0 left-0 right-0 h-16 opacity-[0.09] pointer-events-none"
        style={{ background: "linear-gradient(180deg, var(--mr-red), transparent)" }}
      />
      <span aria-hidden="true" className="absolute top-2 right-2 flex items-center gap-1">
        <span className="block w-1.5 h-px bg-foreground-faint/40" />
        <span className="block h-1.5 w-px bg-foreground-faint/40" />
      </span>
      <div className="p-5 sm:p-6 relative">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase">
            Pool
          </p>
          <span className="text-[10px] font-medium text-foreground-faint group-hover:text-brand transition-colors">
            Öffnen →
          </span>
        </div>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="flex items-baseline gap-3">
            <p className="font-mono-amount text-5xl sm:text-6xl font-bold leading-none text-foreground">
              {count}
            </p>
            <div className="flex flex-col text-[11px] text-foreground-subtle">
              <span className="font-medium">älteste {oldestLabel} alt</span>
              {oldestIso && (
                <span className="font-mono-amount text-foreground-faint">
                  seit {new Date(oldestIso).toLocaleDateString("de-DE", {
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </span>
              )}
            </div>
          </div>
        </div>

        {topVendors.length > 0 && (
          <div className="mt-4 border-t border-line-subtle pt-3">
            <p className="text-[10px] font-semibold text-foreground-subtle tracking-widest uppercase mb-2">
              Top {topVendors.length === 1 ? "Vendor" : `${topVendors.length} Vendoren`}
            </p>
            <div className="flex flex-col gap-1.5">
              {topVendors.map((v) => {
                const widthPct = Math.max(8, Math.round((v.count / topMax) * 100));
                return (
                  <div key={v.haendler} className="flex items-center gap-2 text-[12px]">
                    <span className="truncate flex-1 min-w-0 text-foreground-muted">
                      {v.haendler}
                    </span>
                    <div className="relative h-2 w-24 sm:w-32 rounded bg-input overflow-hidden shrink-0">
                      <span
                        className="absolute inset-y-0 left-0 bg-brand/60"
                        style={{ width: `${widthPct}%` }}
                        aria-hidden="true"
                      />
                    </div>
                    <span className="font-mono-amount font-semibold text-foreground tabular-nums w-6 text-right">
                      {v.count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
