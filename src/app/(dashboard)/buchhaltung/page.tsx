import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BuchhaltungClient } from "@/components/buchhaltung-client";

export default async function BuchhaltungPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");

  const supabase = await createServerSupabaseClient();

  // Freigegebene Bestellungen mit Freigabe-Details laden
  const { data: bestellungen } = await supabase
    .from("bestellungen")
    .select("*")
    .eq("status", "freigegeben")
    .order("updated_at", { ascending: false });

  // Freigaben laden
  const bestellIds = (bestellungen || []).map((b) => b.id);
  const { data: freigaben } = bestellIds.length
    ? await supabase
        .from("freigaben")
        .select("*")
        .in("bestellung_id", bestellIds)
    : { data: [] };

  // Rechnungs-Dokumente laden (für Fälligkeitsdatum + PDF-Download)
  const { data: rechnungen } = bestellIds.length
    ? await supabase
        .from("dokumente")
        .select("*")
        .in("bestellung_id", bestellIds)
        .eq("typ", "rechnung")
    : { data: [] };

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
    };
  });

  return <BuchhaltungClient rows={rows} />;
}
