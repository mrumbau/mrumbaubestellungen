import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BuchhaltungClient } from "@/components/buchhaltung-client";

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

  // Schritt 1: Alle freigegebenen Bestellungen finden
  const [{ data: bestellungen }, { data: projekte }] = await Promise.all([
    supabase
      .from("bestellungen")
      .select(
        "id, bestellnummer, haendler_name, betrag, waehrung, status, bestellungsart, hat_bestellbestaetigung, hat_lieferschein, mahnung_am, mahnung_count, updated_at, bestelldatum, faelligkeitsdatum, kundennummer, projekt_referenz",
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

  const bestellIds = (bestellungen || []).map((b) => b.id);

  // Schritt 2: Freigaben + Rechnungs-Dokumente parallel
  const [{ data: freigaben }, { data: rechnungen }] = bestellIds.length
    ? await Promise.all([
        supabase.from("freigaben").select("bestellung_id, freigegeben_von_name, freigegeben_am").in("bestellung_id", bestellIds),
        supabase
          .from("dokumente")
          .select("id, bestellung_id, gesamtbetrag, faelligkeitsdatum, bezahlt_am, bezahlt_von, archiviert_am, bestellnummer_erkannt, storage_pfad, created_at")
          .in("bestellung_id", bestellIds)
          .eq("typ", "rechnung"),
      ])
    : [{ data: [] as never[] }, { data: [] as never[] }];

  const freigabenMap = new Map(
    (freigaben || []).map((f) => [f.bestellung_id, f])
  );
  const bestellungenMap = new Map(
    (bestellungen || []).map((b) => [b.id, b])
  );

  // Schritt 3: PRO Rechnungs-Dokument eine Row.
  // Wenn eine Bestellung GAR KEIN Rechnungs-Dokument hat (Body-only-extrahierte
  // Rechnungen ohne dokumente-Eintrag) → wir fallen NICHT zurück auf die
  // Bestellung selbst, weil Buchhaltung sonst Phantome sieht. Solche Bestellungen
  // erscheinen erst dann in Buchhaltung wenn ein Rechnungs-Doku angelegt wurde.
  const rows = (rechnungen || []).map((r) => {
    const b = bestellungenMap.get(r.bestellung_id);
    const freigabe = freigabenMap.get(r.bestellung_id);
    if (!b) return null;
    return {
      // Eindeutige Row-ID = dokument-id (statt bestellung-id wie zuvor)
      id: r.id,
      // Backwards-Compat-Feld für den Client (war früher bestellung-id)
      bestellung_id: r.bestellung_id,
      // Rechnungsnummer aus dem Doku, fällt zurück auf Bestellnr. der Bestellung
      bestellnummer: r.bestellnummer_erkannt || b.bestellnummer,
      haendler_name: b.haendler_name,
      // Betrag PER RECHNUNG (statt Sammel-Betrag der Bestellung)
      betrag: r.gesamtbetrag ?? b.betrag,
      waehrung: b.waehrung || "EUR",
      freigegeben_von: freigabe?.freigegeben_von_name || "–",
      freigegeben_am: freigabe?.freigegeben_am || null,
      // Fälligkeit PER RECHNUNG
      faelligkeitsdatum: r.faelligkeitsdatum ?? b.faelligkeitsdatum,
      // Doku-ID = rechnung_id (für PDF-Download-Link). Nur wenn PDF-File da.
      rechnung_id: r.storage_pfad ? r.id : null,
      // Bezahlt PER RECHNUNG
      bezahlt_am: r.bezahlt_am || null,
      bezahlt_von: r.bezahlt_von || null,
      archiviert_am: r.archiviert_am || null,
      bestellungsart: b.bestellungsart || "material",
      hat_bestellbestaetigung: b.hat_bestellbestaetigung || false,
      hat_lieferschein: b.hat_lieferschein || false,
      mahnung_am: b.mahnung_am || null,
      mahnung_count: b.mahnung_count || 0,
      bestelldatum: b.bestelldatum,
      kundennummer: b.kundennummer,
      projekt_referenz: b.projekt_referenz,
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => {
      const aDate = a.freigegeben_am ?? "";
      const bDate = b.freigegeben_am ?? "";
      return bDate.localeCompare(aDate);
    });

  const total = rows.length;
  const reachedCap = total >= HARD_CAP;

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
