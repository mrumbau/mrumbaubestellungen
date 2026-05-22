import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SystemOverviewClient } from "./system-overview-client";

export const dynamic = "force-dynamic";

export default async function SystemOverviewPage() {
  // Role-gate is handled in /einstellungen/system/layout.tsx
  const supabase = await createServerSupabaseClient();

  const [{ data: firmaRaw }, { data: crossDuplikate }] = await Promise.all([
    supabase.from("firma_einstellungen").select("schluessel, wert"),
    // Welle 4 — Cross-Bestellung-PDF-Hash-Anomalie-View
    supabase
      .from("dokumente_cross_bestellung_duplikate")
      .select("*")
      .order("letzte_erfassung", { ascending: false })
      .limit(20),
  ]);

  const firmaMap: Record<string, string> = {};
  for (const e of firmaRaw || []) {
    firmaMap[e.schluessel] = e.wert;
  }

  return (
    <SystemOverviewClient
      firma={{
        bueroAdresse: firmaMap["buero_adresse"] ?? "",
        konfidenzDirekt: firmaMap["konfidenz_direkt"] ?? "0.85",
        konfidenzVorschlag: firmaMap["konfidenz_vorschlag"] ?? "0.60",
      }}
      crossDuplikate={
        (crossDuplikate as Array<{
          content_hash: string;
          bestellung_ids: string[];
          typen: string[];
          anzahl_bestellungen: number;
          anzahl_dokus: number;
          erste_erfassung: string;
          letzte_erfassung: string;
        }> | null) || []
      }
    />
  );
}
