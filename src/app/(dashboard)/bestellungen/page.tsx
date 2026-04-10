import { getBenutzerProfil } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { BestellungenTabelle } from "@/components/bestellungen-tabelle";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function BestellungenPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; projekt_id?: string }>;
}) {
  const profil = await getBenutzerProfil();
  const supabase = await createServerSupabaseClient();
  const { page: pageStr, projekt_id: projektIdParam } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Count + Daten + Projekte parallel laden
  let countQuery = supabase.from("bestellungen").select("*", { count: "exact", head: true });
  let dataQuery = supabase.from("bestellungen").select("*").order("created_at", { ascending: false }).range(from, to);

  // Besteller: eigene Material-Bestellungen + alle Abo/SU Bestellungen (Freigabe durch jeden Besteller möglich)
  if (profil?.rolle === "besteller") {
    countQuery = countQuery.or(`besteller_kuerzel.eq.${profil.kuerzel},bestellungsart.in.(abo,subunternehmer)`);
    dataQuery = dataQuery.or(`besteller_kuerzel.eq.${profil.kuerzel},bestellungsart.in.(abo,subunternehmer)`);
  }

  if (projektIdParam) {
    countQuery = countQuery.eq("projekt_id", projektIdParam);
    dataQuery = dataQuery.eq("projekt_id", projektIdParam);
  }

  const [{ count }, { data: bestellungen }, { data: projekte }] = await Promise.all([
    countQuery,
    dataQuery,
    supabase.from("projekte").select("id, name, farbe").neq("status", "archiviert").order("name"),
  ]);

  const total = count || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const aktiverProjektName = projektIdParam
    ? (projekte || []).find((p) => p.id === projektIdParam)?.name || null
    : null;

  const aktiverProjektFarbe = projektIdParam
    ? (projekte || []).find((p) => p.id === projektIdParam)?.farbe || "#570006"
    : null;

  return (
    <div>
      {/* Breadcrumb bei Projekt-Filter */}
      {projektIdParam && aktiverProjektName && (
        <nav className="flex items-center gap-1.5 text-sm mb-4">
          <a href="/bestellungen" className="text-[#9a9a9a] hover:text-[#570006] transition-colors">Bestellungen</a>
          <svg className="w-3.5 h-3.5 text-[#c4c2bf]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          <span className="inline-flex items-center gap-1.5 font-medium text-[#1a1a1a]">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: aktiverProjektFarbe || "#570006" }} />
            {aktiverProjektName}
          </span>
        </nav>
      )}

      <div className="flex items-center justify-between mb-8">
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

      <BestellungenTabelle
        bestellungen={bestellungen || []}
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={total}
        projekte={(projekte || []) as { id: string; name: string; farbe: string }[]}
        aktiverProjektFilter={projektIdParam || null}
        aktiverProjektName={aktiverProjektName}
        isAdmin={profil?.rolle === "admin"}
      />
    </div>
  );
}
