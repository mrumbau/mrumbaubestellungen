import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ArchivClient } from "@/components/archiv-client";

export const dynamic = "force-dynamic";

export default async function ArchivPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");
  if (profil.rolle === "buchhaltung") redirect("/buchhaltung");

  const supabase = await createServerSupabaseClient();
  const istBesteller = profil.rolle === "besteller";

  // Phase 1: Parallele Queries
  let materialQuery = supabase
    .from("bestellungen")
    .select(
      "id, bestellnummer, haendler_name, besteller_kuerzel, besteller_name, betrag, bezahlt_am, bezahlt_von, bestellungsart, projekt_id, projekt_name, hat_bestellbestaetigung, hat_lieferschein, hat_rechnung, hat_aufmass, hat_leistungsnachweis, subunternehmer_id"
    )
    .not("archiviert_am", "is", null)
    .eq("bestellungsart", "material")
    .order("bezahlt_am", { ascending: false })
    .limit(100);

  let suQuery = supabase
    .from("bestellungen")
    .select(
      "id, bestellnummer, haendler_name, besteller_kuerzel, besteller_name, betrag, bezahlt_am, bezahlt_von, bestellungsart, projekt_id, projekt_name, hat_bestellbestaetigung, hat_lieferschein, hat_rechnung, hat_aufmass, hat_leistungsnachweis, subunternehmer_id"
    )
    .not("archiviert_am", "is", null)
    .eq("bestellungsart", "subunternehmer")
    .order("bezahlt_am", { ascending: false })
    .limit(100);

  if (istBesteller) {
    materialQuery = materialQuery.eq("besteller_kuerzel", profil.kuerzel);
    suQuery = suQuery.eq("besteller_kuerzel", profil.kuerzel);
  }

  const [
    { data: projekte },
    { data: materialOrders },
    { data: suOrders },
    { data: subunternehmer },
  ] = await Promise.all([
    supabase
      .from("projekte")
      .select("id, name, beschreibung, farbe, budget, status, created_at")
      .eq("status", "abgeschlossen")
      .order("created_at", { ascending: false }),
    materialQuery,
    suQuery,
    supabase.from("subunternehmer").select("id, firma, gewerk"),
  ]);

  const safeMatOrders = materialOrders || [];
  const safeSuOrders = suOrders || [];
  const allOrders = [...safeMatOrders, ...safeSuOrders];

  // Phase 2: Dokumente laden (abhängig von Phase 1)
  const allOrderIds = allOrders.map((o) => o.id);
  let dokumenteMap: Record<string, Array<{ id: string; bestellung_id: string; typ: string; storage_pfad: string | null; gesamtbetrag: number | null; created_at: string }>> = {};

  if (allOrderIds.length > 0) {
    const { data: dokumente } = await supabase
      .from("dokumente")
      .select("id, bestellung_id, typ, storage_pfad, gesamtbetrag, created_at")
      .in("bestellung_id", allOrderIds);

    for (const dok of dokumente || []) {
      if (!dokumenteMap[dok.bestellung_id]) {
        dokumenteMap[dok.bestellung_id] = [];
      }
      dokumenteMap[dok.bestellung_id].push(dok);
    }
  }

  // Server-Aggregation: projektStatsMap aus allen Orders
  const projektStatsMap: Record<string, { count: number; volumen: number }> = {};
  const bestellerProjektIds = new Set<string>();

  for (const order of allOrders) {
    if (!order.projekt_id) continue;
    bestellerProjektIds.add(order.projekt_id);
    if (!projektStatsMap[order.projekt_id]) {
      projektStatsMap[order.projekt_id] = { count: 0, volumen: 0 };
    }
    projektStatsMap[order.projekt_id].count++;
    projektStatsMap[order.projekt_id].volumen += Number(order.betrag) || 0;
  }

  // Besteller sieht nur Projekte mit eigenen bezahlten Orders
  let filteredProjekte = projekte || [];
  if (istBesteller) {
    filteredProjekte = filteredProjekte.filter((p) => bestellerProjektIds.has(p.id));
  }

  // SU-Map für Gewerk-Anreicherung
  const suMap: Record<string, { firma: string; gewerk: string | null }> = {};
  for (const su of subunternehmer || []) {
    suMap[su.id] = { firma: su.firma, gewerk: su.gewerk };
  }

  // SU-Orders mit Gewerk anreichern
  const enrichedSuOrders = safeSuOrders.map((order) => ({
    ...order,
    subunternehmer_gewerk: order.subunternehmer_id ? suMap[order.subunternehmer_id]?.gewerk || null : null,
    subunternehmer_firma: order.subunternehmer_id ? suMap[order.subunternehmer_id]?.firma || null : null,
  }));

  // Summary
  const totalVolumen = allOrders.reduce((sum, o) => sum + (Number(o.betrag) || 0), 0);

  return (
    <ArchivClient
      projekte={filteredProjekte}
      materialOrders={safeMatOrders}
      suOrders={enrichedSuOrders}
      dokumenteMap={dokumenteMap}
      projektStats={projektStatsMap}
      summary={{
        totalProjekte: filteredProjekte.length,
        totalMaterial: safeMatOrders.length,
        totalSU: safeSuOrders.length,
        totalVolumen,
      }}
      istAdmin={profil.rolle === "admin"}
      limitReached={{
        material: safeMatOrders.length >= 100,
        su: safeSuOrders.length >= 100,
      }}
    />
  );
}
