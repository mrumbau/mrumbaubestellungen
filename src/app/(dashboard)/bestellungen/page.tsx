import { getBenutzerProfil } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { BestellungenTabelle } from "@/components/bestellungen-tabelle";

const PAGE_SIZE = 20;

export default async function BestellungenPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const profil = await getBenutzerProfil();
  const supabase = await createServerSupabaseClient();
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || "1", 10) || 1);

  // Gesamtanzahl ermitteln
  const { count } = await supabase
    .from("bestellungen")
    .select("*", { count: "exact", head: true });

  const total = count || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  // Paginierte Daten laden
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: bestellungen } = await supabase
    .from("bestellungen")
    .select("*")
    .order("created_at", { ascending: false })
    .range(from, to);

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

      <BestellungenTabelle
        bestellungen={bestellungen || []}
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={total}
      />
    </div>
  );
}
