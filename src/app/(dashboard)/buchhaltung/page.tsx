import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BuchhaltungClient } from "@/components/buchhaltung-client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function BuchhaltungPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");

  const supabase = await createServerSupabaseClient();
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Phase 1: Count + Daten + Projekte parallel
  const [{ count }, { data: bestellungen }, { data: projekte }] = await Promise.all([
    supabase.from("bestellungen").select("*", { count: "exact", head: true }).eq("status", "freigegeben"),
    supabase.from("bestellungen").select("id, bestellnummer, haendler_name, betrag, waehrung, status, bestellungsart, hat_bestellbestaetigung, hat_lieferschein, bezahlt_am, bezahlt_von, archiviert_am, updated_at").eq("status", "freigegeben").order("updated_at", { ascending: false }).range(from, to),
    supabase.from("projekte").select("id, name").in("status", ["aktiv", "pausiert", "abgeschlossen"]).order("name"),
  ]);

  const total = count || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  // Phase 2: Freigaben + Rechnungen parallel (brauchen bestellIds)
  const bestellIds = (bestellungen || []).map((b) => b.id);
  const [{ data: freigaben }, { data: rechnungen }] = bestellIds.length
    ? await Promise.all([
        supabase.from("freigaben").select("bestellung_id, freigegeben_von_name, freigegeben_am").in("bestellung_id", bestellIds),
        supabase.from("dokumente").select("id, bestellung_id, faelligkeitsdatum").in("bestellung_id", bestellIds).eq("typ", "rechnung"),
      ])
    : [{ data: [] as never[] }, { data: [] as never[] }];

  // Daten zusammenführen
  const freigabenMap = new Map(
    (freigaben || []).map((f) => [f.bestellung_id, f])
  );
  const rechnungenMap = new Map(
    (rechnungen || []).map((r) => [r.bestellung_id, r])
  );

  const rows = (bestellungen || []).map((b) => {
    const freigabe = freigabenMap.get(b.id);
    const rechnung = rechnungenMap.get(b.id);
    return {
      id: b.id,
      bestellnummer: b.bestellnummer,
      haendler_name: b.haendler_name,
      betrag: b.betrag,
      waehrung: b.waehrung || "EUR",
      freigegeben_von: freigabe?.freigegeben_von_name || "–",
      freigegeben_am: freigabe?.freigegeben_am || null,
      faelligkeitsdatum: rechnung?.faelligkeitsdatum || null,
      rechnung_id: rechnung?.id || null,
      bezahlt_am: b.bezahlt_am || null,
      bezahlt_von: b.bezahlt_von || null,
      archiviert_am: b.archiviert_am || null,
      bestellungsart: b.bestellungsart || "material",
      hat_bestellbestaetigung: b.hat_bestellbestaetigung || false,
      hat_lieferschein: b.hat_lieferschein || false,
    };
  });

  return (
    <BuchhaltungClient
      rows={rows}
      currentPage={currentPage}
      totalPages={totalPages}
      totalCount={total}
      projekte={(projekte || []).map((p) => ({ id: p.id, name: p.name }))}
      rolle={profil.rolle}
    />
  );
}
