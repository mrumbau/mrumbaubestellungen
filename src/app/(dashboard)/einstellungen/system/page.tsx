import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SystemOverviewClient } from "./system-overview-client";

export const dynamic = "force-dynamic";

export default async function SystemOverviewPage() {
  // Role-gate is handled in /einstellungen/system/layout.tsx
  const supabase = await createServerSupabaseClient();

  const [{ data: firmaRaw }, { data: besteller }, { data: signale }] = await Promise.all([
    supabase.from("firma_einstellungen").select("schluessel, wert"),
    supabase
      .from("benutzer_rollen")
      .select("id, email, name, kuerzel, rolle")
      .eq("rolle", "besteller")
      .order("name"),
    supabase
      .from("bestellung_signale")
      .select("kuerzel, zeitstempel")
      .order("zeitstempel", { ascending: false }),
  ]);

  const firmaMap: Record<string, string> = {};
  for (const e of firmaRaw || []) {
    firmaMap[e.schluessel] = e.wert;
  }

  const signalMap: Record<string, string> = {};
  for (const s of signale || []) {
    if (!signalMap[s.kuerzel]) signalMap[s.kuerzel] = s.zeitstempel;
  }

  return (
    <SystemOverviewClient
      firma={{
        bueroAdresse: firmaMap["buero_adresse"] ?? "",
        konfidenzDirekt: firmaMap["konfidenz_direkt"] ?? "0.85",
        konfidenzVorschlag: firmaMap["konfidenz_vorschlag"] ?? "0.60",
      }}
      besteller={
        (besteller as { id: string; name: string; kuerzel: string }[]) || []
      }
      extensionSignale={signalMap}
    />
  );
}
