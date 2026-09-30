import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { istNurAdmin } from "@/lib/rollen";
import { TestdatenClient } from "./testdaten-client";

export const dynamic = "force-dynamic";

export default async function TestdatenPage() {
  // 30.09.2026 — eigenes Gate statt Verlass auf das Eltern-Layout: seit es
  // die Geschaeftsfuehrung gibt, laesst /einstellungen/system mehr durch als
  // frueher. Testdaten bleiben der IT vorbehalten.
  const profil = await getBenutzerProfil();
  if (!istNurAdmin(profil?.rolle)) redirect("/einstellungen/system");

  const supabase = await createServerSupabaseClient();
  const { data: testCheck } = await supabase
    .from("bestellungen")
    .select("id")
    .like("bestellnummer", "TEST-%")
    .limit(1);

  return <TestdatenClient initialHatTestdaten={!!testCheck && testCheck.length > 0} />;
}
