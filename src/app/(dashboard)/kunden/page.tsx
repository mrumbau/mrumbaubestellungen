import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { KundenClient } from "@/components/kunden-client";

export const dynamic = "force-dynamic";

export default async function KundenPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");
  if (profil.rolle === "buchhaltung") redirect("/buchhaltung");

  const supabase = await createServerSupabaseClient();

  const [{ data: kunden }, { data: projekte }, { data: bestellungen }] = await Promise.all([
    supabase.from("kunden").select("*").order("name"),
    supabase
      .from("projekte")
      .select("id, name, kunden_id")
      .not("kunden_id", "is", null),
    supabase
      .from("bestellungen")
      .select("kunden_id, betrag")
      .not("kunden_id", "is", null),
  ]);

  // Stats pro Kunde aggregieren
  const statsMap: Record<string, { projekte: number; bestellungen: number; volumen: number }> = {};

  for (const p of projekte || []) {
    if (!p.kunden_id) continue;
    if (!statsMap[p.kunden_id]) statsMap[p.kunden_id] = { projekte: 0, bestellungen: 0, volumen: 0 };
    statsMap[p.kunden_id].projekte++;
  }

  for (const b of bestellungen || []) {
    if (!b.kunden_id) continue;
    if (!statsMap[b.kunden_id]) statsMap[b.kunden_id] = { projekte: 0, bestellungen: 0, volumen: 0 };
    statsMap[b.kunden_id].bestellungen++;
    statsMap[b.kunden_id].volumen += Number(b.betrag) || 0;
  }

  return (
    <KundenClient
      kunden={(kunden || []) as Array<{
        id: string;
        name: string;
        kuerzel: string | null;
        adresse: string | null;
        email: string | null;
        telefon: string | null;
        notizen: string | null;
        keywords: string[];
        farbe: string;
        confirmed_at: string | null;
        created_at: string;
      }>}
      stats={statsMap}
      istAdmin={profil.rolle === "admin" || profil.rolle === "besteller"}
    />
  );
}
