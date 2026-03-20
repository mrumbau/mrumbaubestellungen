import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ProjekteClient } from "@/components/projekte-client";

export const dynamic = "force-dynamic";

export default async function ProjektePage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");
  if (profil.rolle === "buchhaltung") redirect("/buchhaltung");

  const supabase = await createServerSupabaseClient();

  // Projekte + Bestellungs-Stats + Kunden parallel
  const [{ data: projekte }, { data: bestellStats }, { data: kunden }] = await Promise.all([
    supabase.from("projekte").select("*").order("created_at", { ascending: false }),
    supabase
      .from("bestellungen")
      .select("projekt_id, status, betrag")
      .not("projekt_id", "is", null),
    supabase.from("kunden").select("id, name").order("name"),
  ]);

  // Stats pro Projekt aggregieren
  const statsMap: Record<string, { gesamt: number; offen: number; volumen: number }> = {};
  for (const b of bestellStats || []) {
    if (!b.projekt_id) continue;
    if (!statsMap[b.projekt_id]) {
      statsMap[b.projekt_id] = { gesamt: 0, offen: 0, volumen: 0 };
    }
    statsMap[b.projekt_id].gesamt++;
    if (["offen", "erwartet", "abweichung", "ls_fehlt", "vollstaendig"].includes(b.status)) {
      statsMap[b.projekt_id].offen++;
    }
    statsMap[b.projekt_id].volumen += Number(b.betrag) || 0;
  }

  return (
    <ProjekteClient
      projekte={projekte || []}
      stats={statsMap}
      kunden={kunden || []}
      istAdmin={profil.rolle === "admin" || profil.rolle === "besteller"}
    />
  );
}
