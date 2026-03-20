import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export default async function Home() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    // Eingeloggt → Rolle prüfen und passend weiterleiten
    const { data: profil } = await supabase
      .from("benutzer_rollen")
      .select("rolle")
      .eq("user_id", user.id)
      .single();

    if (profil?.rolle === "buchhaltung") {
      redirect("/buchhaltung");
    }
    redirect("/dashboard");
  }

  redirect("/login");
}
