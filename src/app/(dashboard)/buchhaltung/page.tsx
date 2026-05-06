import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BuchhaltungClient } from "@/components/buchhaltung-client";

export const dynamic = "force-dynamic";

// 07.05.2026 — Pagination komplett client-side (analog Bestellungen).
// Vorher: server-side range(0,19) + client-side Tabs/Filter → Filter+Sort sahen
// nur 20er-Slice, Bezahlt/Offen-Counts waren falsch über Pages, Suche traf
// nicht alle Treffer. Bei freigegebenen Bestellungen reicht alles-laden bis
// HARD_CAP. Darüber hinaus archivieren oder Server-Pagination.
const HARD_CAP = 500;

export default async function BuchhaltungPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");

  const supabase = await createServerSupabaseClient();

  // Alle freigegebenen Bestellungen + Projekte parallel
  const [{ data: bestellungen }, { data: projekte }] = await Promise.all([
    supabase
      .from("bestellungen")
      .select(
        "id, bestellnummer, haendler_name, betrag, waehrung, status, bestellungsart, hat_bestellbestaetigung, hat_lieferschein, bezahlt_am, bezahlt_von, archiviert_am, mahnung_am, mahnung_count, updated_at, bestelldatum, faelligkeitsdatum, kundennummer, projekt_referenz",
      )
      .eq("status", "freigegeben")
      .order("updated_at", { ascending: false })
      .limit(HARD_CAP),
    supabase
      .from("projekte")
      .select("id, name")
      .in("status", ["aktiv", "pausiert", "abgeschlossen"])
      .order("name"),
  ]);

  const total = bestellungen?.length ?? 0;
  const reachedCap = total >= HARD_CAP;

  // Phase 2: Freigaben parallel; faelligkeitsdatum kommt jetzt direkt aus
  // bestellungen-Spalte (06.05.2026 — kein Doku-Join mehr nötig).
  // Wir laden trotzdem rechnung_id für PDF-Download-Link (datev-modal etc.).
  const bestellIds = (bestellungen || []).map((b) => b.id);
  const [{ data: freigaben }, { data: rechnungen }] = bestellIds.length
    ? await Promise.all([
        supabase.from("freigaben").select("bestellung_id, freigegeben_von_name, freigegeben_am").in("bestellung_id", bestellIds),
        supabase.from("dokumente").select("id, bestellung_id").in("bestellung_id", bestellIds).eq("typ", "rechnung"),
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
      faelligkeitsdatum: b.faelligkeitsdatum,
      rechnung_id: rechnung?.id || null,
      bezahlt_am: b.bezahlt_am || null,
      bezahlt_von: b.bezahlt_von || null,
      archiviert_am: b.archiviert_am || null,
      bestellungsart: b.bestellungsart || "material",
      hat_bestellbestaetigung: b.hat_bestellbestaetigung || false,
      hat_lieferschein: b.hat_lieferschein || false,
      mahnung_am: b.mahnung_am || null,
      mahnung_count: b.mahnung_count || 0,
      bestelldatum: b.bestelldatum,
      kundennummer: b.kundennummer,
      projekt_referenz: b.projekt_referenz,
    };
  });

  return (
    <BuchhaltungClient
      rows={rows}
      projekte={(projekte || []).map((p) => ({ id: p.id, name: p.name }))}
      rolle={profil.rolle}
      reachedCap={reachedCap}
      hardCap={HARD_CAP}
    />
  );
}
