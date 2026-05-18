import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BuchhaltungClient } from "@/components/buchhaltung-client";
import { displayBestellnummer } from "@/lib/bestellung-utils";

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

  // Schritt 1: Alle freigegebenen Bestellungen finden
  // 17.05.2026 — Gutschriften kommen direkt rein (keine Freigabe nötig, weil
  // Geld zurückkommt — kein Approval-Risk). Filter ist daher: status=freigegeben
  // ODER ist_gutschrift=true (PostgREST or-Syntax).
  const [{ data: bestellungen }, { data: projekte }] = await Promise.all([
    supabase
      .from("bestellungen")
      .select(
        "id, bestellnummer, auftragsnummer, lieferscheinnummer, haendler_name, betrag, waehrung, status, bestellungsart, hat_bestellbestaetigung, hat_lieferschein, mahnung_am, mahnung_count, updated_at, bestelldatum, faelligkeitsdatum, kundennummer, projekt_referenz, ist_gutschrift",
      )
      .or("status.eq.freigegeben,ist_gutschrift.eq.true")
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
          .eq("typ", "rechnung")
          // Archivierte Rechnungen gehören ins Archiv-View, nicht in Buchhaltung.
          // Spart Wire-Bytes + Client-Filter-Cycles bei wachsendem Datenvolumen.
          .is("archiviert_am", null),
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
    if (!r.bestellung_id) return null; // Orphan-Schutz (Type-Sicherheit)
    const b = bestellungenMap.get(r.bestellung_id);
    const freigabe = freigabenMap.get(r.bestellung_id);
    if (!b) return null;
    return {
      // Eindeutige Row-ID = dokument-id (statt bestellung-id wie zuvor)
      id: r.id,
      // Backwards-Compat-Feld für den Client (war früher bestellung-id)
      bestellung_id: r.bestellung_id,
      // 08.05.2026 — Anzeige-Priorität pro Buchhaltungs-Zeile:
      // Rechnungsnummer aus dem Doku (= Buchungsbeleg) > displayBestellnummer
      // der Bestellung (Auftragsnr/Bestellnr, NIE LS-Nr).
      bestellnummer: r.bestellnummer_erkannt || displayBestellnummer(b),
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
      // 17.05.2026 — Gutschrift-Flag für UI-Markierung (grünes Label, evtl.
      // Soll/Haben-Tausch im DATEV-Export, Filter-Kategorie).
      ist_gutschrift: b.ist_gutschrift || false,
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
      rows={rows as unknown as import("@/components/buchhaltung/types").BuchhaltungRow[]}
      projekte={(projekte || []).map((p) => ({ id: p.id, name: p.name }))}
      rolle={profil.rolle}
      reachedCap={reachedCap}
      hardCap={HARD_CAP}
    />
  );
}
