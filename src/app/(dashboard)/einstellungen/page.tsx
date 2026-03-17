import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { EinstellungenClient } from "@/components/einstellungen-client";

export default async function EinstellungenPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");
  if (profil.rolle !== "admin") redirect("/dashboard");

  const supabase = await createServerSupabaseClient();

  // Alle Queries parallel laden
  const [
    { data: haendler },
    { data: benutzer },
    { data: testCheck },
    { data: haendlerStats },
    { data: extensionSignale },
    { data: webhookLogs },
  ] = await Promise.all([
    supabase.from("haendler").select("*").order("name", { ascending: true }),
    supabase.from("benutzer_rollen").select("id, email, name, kuerzel, rolle").order("name", { ascending: true }),
    supabase.from("bestellungen").select("id").like("bestellnummer", "TEST-%").limit(1),
    // Händler-Statistiken: Bestellungen pro Händler aggregiert
    supabase.from("bestellungen").select("haendler_name, status, created_at"),
    // Chrome Extension: Letztes Signal pro Besteller
    supabase
      .from("bestellung_signale")
      .select("kuerzel, zeitstempel")
      .order("zeitstempel", { ascending: false }),
    // Webhook-Logs: Letzte 20
    supabase
      .from("webhook_logs")
      .select("id, typ, status, bestellnummer, fehler_text, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // Händler-Stats aggregieren: { haendler_name: { gesamt, letzte, abweichungen } }
  const statsMap: Record<string, { gesamt: number; letzte: string | null; abweichungen: number }> = {};
  for (const b of haendlerStats || []) {
    if (!b.haendler_name) continue;
    if (!statsMap[b.haendler_name]) {
      statsMap[b.haendler_name] = { gesamt: 0, letzte: null, abweichungen: 0 };
    }
    statsMap[b.haendler_name].gesamt++;
    if (b.status === "abweichung") statsMap[b.haendler_name].abweichungen++;
    if (!statsMap[b.haendler_name].letzte || b.created_at > statsMap[b.haendler_name].letzte!) {
      statsMap[b.haendler_name].letzte = b.created_at;
    }
  }

  // Extension-Signale: Letztes Signal pro Kürzel
  const signalMap: Record<string, string> = {};
  for (const s of extensionSignale || []) {
    if (!signalMap[s.kuerzel]) {
      signalMap[s.kuerzel] = s.zeitstempel;
    }
  }

  return (
    <EinstellungenClient
      haendler={haendler || []}
      benutzer={benutzer || []}
      hatTestdaten={!!testCheck && testCheck.length > 0}
      haendlerStats={statsMap}
      extensionSignale={signalMap}
      webhookLogs={(webhookLogs || []) as { id: string; typ: string; status: string; bestellnummer: string | null; fehler_text: string | null; created_at: string }[]}
    />
  );
}
