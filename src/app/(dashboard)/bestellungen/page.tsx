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
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="font-headline text-2xl text-[#1a1a1a] tracking-tight">Bestellungen</h1>
          <p className="text-[#9a9a9a] text-sm mt-1">
            {profil?.rolle === "admin"
              ? "Alle Bestellungen"
              : "Deine Bestellungen"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono-amount text-xs text-[#9a9a9a]">{total}</span>
          <span className="text-[10px] text-[#c4c2bf] uppercase tracking-wide">Gesamt</span>
        </div>
      </div>
      <div className="industrial-line" />

      <BestellungenTabelle
        bestellungen={bestellungen || []}
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={total}
      />
    </div>
  );
}
