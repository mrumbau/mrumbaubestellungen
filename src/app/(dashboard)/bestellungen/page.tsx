import { getBenutzerProfil } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { BestellungenTabelle } from "@/components/bestellungen-tabelle";

export default async function BestellungenPage() {
  const profil = await getBenutzerProfil();
  const supabase = await createServerSupabaseClient();

  const { data: bestellungen } = await supabase
    .from("bestellungen")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bestellungen</h1>
          <p className="text-slate-500 mt-1">
            {profil?.rolle === "admin"
              ? "Alle Bestellungen"
              : "Deine Bestellungen"}
          </p>
        </div>
      </div>

      <BestellungenTabelle bestellungen={bestellungen || []} />
    </div>
  );
}
