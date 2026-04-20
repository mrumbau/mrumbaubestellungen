import { createServerSupabaseClient } from "@/lib/supabase-server";
import { BenutzerClient, type Benutzer } from "./benutzer-client";

export const dynamic = "force-dynamic";

export default async function BenutzerPage() {
  // Role-gate handled in parent /einstellungen/system/layout.tsx
  const supabase = await createServerSupabaseClient();
  const { data: benutzer } = await supabase
    .from("benutzer_rollen")
    .select("id, email, name, kuerzel, rolle")
    .order("name");

  return <BenutzerClient benutzer={(benutzer as Benutzer[]) || []} />;
}
