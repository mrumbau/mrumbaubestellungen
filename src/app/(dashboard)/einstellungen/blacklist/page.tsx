import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { BlacklistClient, type BlacklistEntry } from "./blacklist-client";

export const dynamic = "force-dynamic";

export default async function BlacklistPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");
  if (profil.rolle !== "admin") redirect("/einstellungen");

  const supabase = await createServerSupabaseClient();
  const { data: liste } = await supabase
    .from("email_blacklist")
    .select("muster, typ, grund, erstellt_am")
    .order("erstellt_am", { ascending: false });

  return <BlacklistClient initialListe={(liste as BlacklistEntry[]) || []} />;
}
