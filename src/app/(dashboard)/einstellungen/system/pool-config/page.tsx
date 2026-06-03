import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { PoolConfigClient } from "./pool-config-client";

export const dynamic = "force-dynamic";

/**
 * /einstellungen/system/pool-config — Admin-UI für Pool-2.0-Auto-Claim
 * + Score-Gewichte. Liest und schreibt aus firma_einstellungen.
 *
 * Pool 2.0 Sprint 3 (03.06.2026):
 *   - pool_auto_claim_enabled (Toggle)
 *   - pool_auto_claim_threshold (0.5..1.0)
 *   - pool_auto_claim_methods (CSV)
 *   - pool_score_weights (5 Slider, sum-normalisiert nur visuell)
 *   - pool_score_top_x_threshold (0.0..1.0)
 *
 * Wichtig: die Schwelle/Threshold gilt für Pipeline UND Cron — beide
 * lesen dieselben Settings. Cron pickt UNBEKANNT-Items im 5-min-Takt.
 */
export default async function PoolConfigPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");
  if (profil.rolle !== "admin") redirect("/einstellungen");

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("firma_einstellungen")
    .select("schluessel, wert")
    .in("schluessel", [
      "pool_auto_claim_enabled",
      "pool_auto_claim_threshold",
      "pool_auto_claim_methods",
      "pool_score_weights",
      "pool_score_top_x_threshold",
    ]);

  const settings = new Map(
    (data ?? []).map((s) => [s.schluessel, s.wert] as const),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Pool-Konfiguration"
        description="Auto-Claim-Schwelle, Methoden-Whitelist und Score-Gewichte für den Material-Bestellungs-Pool. Auto-Claim ist standardmäßig deaktiviert — schalte ihn erst ein, wenn die Vorschlag-Konfidenz im Pool zuverlässig sichtbar ist."
      />
      <PoolConfigClient
        initial={{
          enabled: (settings.get("pool_auto_claim_enabled") ?? "false").toLowerCase() === "true",
          threshold: parseFloat(settings.get("pool_auto_claim_threshold") ?? "0.95"),
          methods: (settings.get("pool_auto_claim_methods") ?? "besteller_im_dokument")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          weightsRaw: settings.get("pool_score_weights") ?? "",
          topXThreshold: parseFloat(settings.get("pool_score_top_x_threshold") ?? "0.8"),
        }}
      />
    </div>
  );
}
