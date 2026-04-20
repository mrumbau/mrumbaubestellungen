import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  SubunternehmerClient,
  type Subunternehmer,
} from "./subunternehmer-client";

export const dynamic = "force-dynamic";

export default async function SubunternehmerPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");
  if (profil.rolle === "buchhaltung") redirect("/einstellungen");

  const supabase = await createServerSupabaseClient();
  const { data: subunternehmer } = await supabase
    .from("subunternehmer")
    .select(
      "id, firma, ansprechpartner, gewerk, telefon, email, email_absender, steuer_nr, iban, notizen, confirmed_at, created_at",
    )
    .order("firma");

  return (
    <SubunternehmerClient
      initialListe={(subunternehmer as Subunternehmer[]) || []}
      canEdit={profil.rolle === "admin"}
    />
  );
}
