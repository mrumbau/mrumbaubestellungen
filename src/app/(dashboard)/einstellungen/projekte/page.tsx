import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ProjekteClient, type Projekt } from "./projekte-client";

export const dynamic = "force-dynamic";

export default async function ProjektePage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");
  if (profil.rolle === "buchhaltung") redirect("/einstellungen");

  const supabase = await createServerSupabaseClient();
  const { data: projekte } = await supabase
    .from("projekte")
    .select("id, name, farbe, budget, status, beschreibung, kunde, adresse, adresse_keywords")
    .order("name");

  return (
    <ProjekteClient
      initialProjekte={(projekte as Projekt[]) || []}
      canEdit={profil.rolle === "admin"}
    />
  );
}
