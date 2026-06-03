import { createServerSupabaseClient } from "@/lib/supabase-server";
import { PageHeader } from "@/components/ui/page-header";
import { RulesClient, type Rule, type BestellerRoleEntry } from "./rules-client";

export const dynamic = "force-dynamic";

/**
 * /einstellungen/system/rules — Admin-UI für besteller_rules.
 *
 * Welle 4 O8 (06.05.2026) — Foundation war Schema + match_besteller_rules-RPC
 * + Code-Integration als STUFE -1 in run.ts. Aber: ohne UI bleibt die
 * Tabelle leer. Diese Page macht die Engine nutzbar.
 *
 * Rules werden in der E-Mail-Pipeline ausgewertet:
 *   1. Mail kommt rein
 *   2. STUFE -1: match_besteller_rules-RPC findet erstes match nach priority
 *   3. Bei Treffer: Besteller direkt zugeordnet, hit_count + last_hit_at++
 *   4. Bei Miss: Pipeline läuft weiter mit STUFE 0+ (BN-Match, Signal, etc.)
 *
 * Use-Cases:
 *   - "Mails von raab-karcher.de → MT" (haendler_domain)
 *   - "Subject mit 'T-Mobile' → MH" (subject_keyword)
 *   - "Absender @hamdi-muhameti.de → CR" (absender_pattern)
 */
export default async function RulesPage() {
  // Role-gate via parent layout (admin-only)
  const supabase = await createServerSupabaseClient();

  const [{ data: rules }, { data: bestellerRollen }] = await Promise.all([
    supabase
      .from("besteller_rules")
      .select("*")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false }),
    supabase
      .from("benutzer_rollen")
      .select("kuerzel, name, rolle")
      .in("rolle", ["besteller", "admin"])
      .order("name"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Auto-Zuordnungs-Regeln"
        description="Konfigurierbare Regeln für die automatische Besteller-Erkennung. Werden in der E-Mail-Pipeline VOR der KI-Analyse ausgewertet — bei Match wird der Besteller direkt zugeordnet, sonst greift die normale 5-Stufen-Logik (Bestellnummer-Match, Signal, Händler-Affinität, Name-im-Text, KI-Historie)."
      />
      {/* 03.06.2026 (Pool 2.0 Sprint 3): DB-Schema `besteller_rules.combiner`
          + `condition: Json` ist nun breiter als der UI-rigide `Rule.condition:
          {type,value}`. UI-Code rendert nur Single-Condition; Multi-Condition
          Form-Builder ist deferred (siehe Plan-File). Cast via unknown ist
          konsistent mit Bestellung[]-Cast in bestellungen/page.tsx. */}
      <RulesClient
        initialRules={(rules as unknown as Rule[]) || []}
        bestellerListe={(bestellerRollen as BestellerRoleEntry[]) || []}
      />
    </div>
  );
}
