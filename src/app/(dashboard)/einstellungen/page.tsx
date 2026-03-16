import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { EinstellungenClient } from "@/components/einstellungen-client";

export default async function EinstellungenPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");
  if (profil.rolle !== "admin") redirect("/dashboard");

  const supabase = await createServerSupabaseClient();

  const { data: haendler } = await supabase
    .from("haendler")
    .select("*")
    .order("name", { ascending: true });

  const { data: benutzer } = await supabase
    .from("benutzer_rollen")
    .select("id, email, name, kuerzel, rolle")
    .order("name", { ascending: true });

  const { data: testCheck } = await supabase
    .from("bestellungen")
    .select("id")
    .like("bestellnummer", "TEST-%")
    .limit(1);

  return (
    <EinstellungenClient
      haendler={haendler || []}
      benutzer={benutzer || []}
      hatTestdaten={!!testCheck && testCheck.length > 0}
    />
  );
}
