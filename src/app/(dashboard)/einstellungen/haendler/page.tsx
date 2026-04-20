import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { HaendlerClient, type Haendler, type HaendlerStat } from "./haendler-client";

export const dynamic = "force-dynamic";

export default async function HaendlerPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");
  if (profil.rolle !== "admin") redirect("/einstellungen");

  const supabase = await createServerSupabaseClient();

  const [{ data: haendler }, { data: statsRows }] = await Promise.all([
    supabase
      .from("haendler")
      .select("id, name, domain, email_absender, url_muster")
      .order("name", { ascending: true }),
    supabase.from("bestellungen").select("haendler_name, status, created_at"),
  ]);

  const stats: Record<string, HaendlerStat> = {};
  for (const row of statsRows || []) {
    if (!row.haendler_name) continue;
    const s = stats[row.haendler_name] ?? { gesamt: 0, letzte: null, abweichungen: 0 };
    s.gesamt++;
    if (row.status === "abweichung") s.abweichungen++;
    if (!s.letzte || (row.created_at && row.created_at > s.letzte)) {
      s.letzte = row.created_at ?? s.letzte;
    }
    stats[row.haendler_name] = s;
  }

  return <HaendlerClient initialHaendler={(haendler as Haendler[]) || []} stats={stats} />;
}
