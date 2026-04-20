import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SystemClient } from "./system-client";

export const dynamic = "force-dynamic";

export default async function SystemPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");
  if (profil.rolle !== "admin") redirect("/einstellungen");

  const supabase = await createServerSupabaseClient();

  const [
    { data: firmaRaw },
    { data: webhookLogs },
    { data: benutzer },
    { data: signale },
    { data: testCheck },
  ] = await Promise.all([
    supabase.from("firma_einstellungen").select("schluessel, wert"),
    supabase
      .from("webhook_logs")
      .select("id, typ, status, bestellnummer, fehler_text, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("benutzer_rollen")
      .select("id, email, name, kuerzel, rolle")
      .order("name"),
    supabase
      .from("bestellung_signale")
      .select("kuerzel, zeitstempel")
      .order("zeitstempel", { ascending: false }),
    supabase.from("bestellungen").select("id").like("bestellnummer", "TEST-%").limit(1),
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
    <SystemClient
      firma={{
        bueroAdresse: firmaMap["buero_adresse"] ?? "",
        konfidenzDirekt: firmaMap["konfidenz_direkt"] ?? "0.85",
        konfidenzVorschlag: firmaMap["konfidenz_vorschlag"] ?? "0.60",
      }}
      initialWebhookLogs={
        (webhookLogs as {
          id: string;
          typ: string;
          status: string;
          bestellnummer: string | null;
          fehler_text: string | null;
          created_at: string;
        }[]) || []
      }
      benutzer={
        (benutzer as {
          id: string;
          email: string;
          name: string;
          kuerzel: string;
          rolle: string;
        }[]) || []
      }
      extensionSignale={signalMap}
      hatTestdaten={!!testCheck && testCheck.length > 0}
    />
  );
}
