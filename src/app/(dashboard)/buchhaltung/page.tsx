import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BuchhaltungClient } from "@/components/buchhaltung-client";
import { buchhaltungZeilen, type RechnungMitBestellung } from "@/lib/buchhaltung-zeilen";

// 15.05.2026 (Cold-Start-Fix): Edge-Runtime → ~0ms cold-start statt Lambda-Container.
export const runtime = "edge";
export const dynamic = "force-dynamic";

// 07.05.2026 (v2) — Buchhaltung pro RECHNUNGS-DOKUMENT statt pro Bestellung.
// Eine Sammel-Bestellung mit Teilrechnungen (Raab Karcher etc.) erscheint
// jetzt als n Zeilen, jede mit eigener Rechnungsnr / Betrag / Fälligkeit /
// Bezahlt-Status. Für DATEV-Export, GoBD-konforme Buchung und Mahnung-
// Tracking ist das die korrekte Granularität.
const HARD_CAP = 500;

export default async function BuchhaltungPage() {
  const profil = await getBenutzerProfil();
  if (!profil) redirect("/login");

  const supabase = await createServerSupabaseClient();

  // 10.10.2026 — Eine Abfrage statt vier in zwei Wellen: jede nicht
  // archivierte Rechnung mit ihrer Bestellung (nur freigegebene oder
  // Gutschriften, 17.05.2026) und deren Freigabe eingebettet. Vorher: erst
  // 500 Bestellungen, dann Freigaben und Rechnungen per `.in()` mit 500
  // UUIDs in der URL. Gemessen in der Region: 882 ms fuer die Seite.
  //
  // Eine Bestellung OHNE Rechnungs-Beleg (nur aus dem Mailtext erkannt)
  // erscheint hier bewusst nicht — die Buchhaltung saehe sonst Phantome.
  const [{ data: rechnungen, error: rechnungenFehler }, { data: projekte }] = await Promise.all([
    supabase
      .from("dokumente")
      .select(
        "id, bestellung_id, gesamtbetrag, faelligkeitsdatum, bezahlt_am, bezahlt_von, archiviert_am, bestellnummer_erkannt, storage_pfad, created_at, bezahlt_bereits, zahlungsmethode, bestellungen!inner(bestellnummer, auftragsnummer, lieferscheinnummer, haendler_name, betrag, waehrung, bestellungsart, hat_bestellbestaetigung, hat_lieferschein, mahnung_am, mahnung_count, bestelldatum, faelligkeitsdatum, kundennummer, projekt_referenz, ist_gutschrift, freigaben(freigegeben_von_name, freigegeben_am))",
      )
      .eq("typ", "rechnung")
      // Archivierte Rechnungen gehören ins Archiv, nicht in die Buchhaltung.
      .is("archiviert_am", null)
      .or("status.eq.freigegeben,ist_gutschrift.eq.true", { referencedTable: "bestellungen" })
      .order("created_at", { ascending: false })
      .limit(HARD_CAP),
    supabase
      .from("projekte")
      .select("id, name")
      .in("status", ["aktiv", "pausiert", "abgeschlossen"])
      .order("name"),
  ]);
  if (rechnungenFehler) {
    throw new Error(`Buchhaltung: Rechnungen nicht geladen — ${rechnungenFehler.message}`);
  }

  const rows = buchhaltungZeilen((rechnungen ?? []) as unknown as RechnungMitBestellung[]);

  const total = rows.length;
  const reachedCap = total >= HARD_CAP;

  return (
    <BuchhaltungClient
      rows={rows as unknown as import("@/components/buchhaltung/types").BuchhaltungRow[]}
      projekte={(projekte || []).map((p) => ({ id: p.id, name: p.name }))}
      rolle={profil.rolle}
      reachedCap={reachedCap}
      hardCap={HARD_CAP}
    />
  );
}
