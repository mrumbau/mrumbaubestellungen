import { displayBestellnummer } from "@/lib/bestellung-utils";
import type { BuchhaltungRow } from "@/components/buchhaltung/types";

/**
 * Buchhaltung: aus Rechnungs-Belegen werden Zeilen (10.10.2026).
 *
 * Vorher holte die Seite erst 500 Bestellungen, dann mit deren IDs in
 * zwei weiteren Abfragen Freigaben und Rechnungen — zwei Wellen und eine
 * URL mit 500 UUIDs. Jetzt kommt alles eingebettet in einer Abfrage:
 * `dokumente` → `bestellungen!inner` → `freigaben`. Diese Datei macht aus
 * dem Ergebnis die Zeilen; die Logik ist dieselbe wie vorher, nur testbar.
 */
export interface RechnungMitBestellung {
  id: string;
  bestellung_id: string | null;
  gesamtbetrag: number | null;
  faelligkeitsdatum: string | null;
  bezahlt_am: string | null;
  bezahlt_von: string | null;
  archiviert_am: string | null;
  bestellnummer_erkannt: string | null;
  storage_pfad: string | null;
  bezahlt_bereits: boolean | null;
  zahlungsmethode: string | null;
  bestellungen: {
    bestellnummer: string | null;
    auftragsnummer: string | null;
    lieferscheinnummer: string | null;
    haendler_name: string | null;
    betrag: number | null;
    waehrung: string | null;
    bestellungsart: string | null;
    hat_bestellbestaetigung: boolean | null;
    hat_lieferschein: boolean | null;
    mahnung_am: string | null;
    mahnung_count: number | null;
    bestelldatum: string | null;
    faelligkeitsdatum: string | null;
    kundennummer: string | null;
    projekt_referenz: string | null;
    ist_gutschrift: boolean | null;
    freigaben: Array<{ freigegeben_von_name: string | null; freigegeben_am: string | null }> | null;
  } | null;
}

/**
 * Eine Zeile je Rechnungs-Beleg, neueste Freigabe zuerst. Belege ohne
 * Bestellung werden ausgelassen (Orphan-Schutz). Eine Bestellung mit
 * Teilrechnungen erscheint als mehrere Zeilen — Betrag und Faelligkeit
 * kommen je Rechnung, mit der Bestellung als Rueckfall.
 */
export function buchhaltungZeilen(rechnungen: ReadonlyArray<RechnungMitBestellung>): BuchhaltungRow[] {
  const zeilen: BuchhaltungRow[] = [];
  for (const r of rechnungen) {
    const b = r.bestellungen;
    if (!r.bestellung_id || !b) continue;
    const freigabe = (b.freigaben ?? [])
      .slice()
      .sort((x, y) => (y.freigegeben_am ?? "").localeCompare(x.freigegeben_am ?? ""))[0];
    zeilen.push({
      id: r.id,
      bestellung_id: r.bestellung_id,
      bestellnummer: r.bestellnummer_erkannt || displayBestellnummer(b),
      haendler_name: b.haendler_name,
      betrag: r.gesamtbetrag ?? b.betrag,
      waehrung: b.waehrung || "EUR",
      freigegeben_von: freigabe?.freigegeben_von_name || "–",
      freigegeben_am: freigabe?.freigegeben_am || null,
      faelligkeitsdatum: r.faelligkeitsdatum ?? b.faelligkeitsdatum,
      rechnung_id: r.storage_pfad ? r.id : null,
      bezahlt_am: r.bezahlt_am || null,
      bezahlt_von: r.bezahlt_von || null,
      archiviert_am: r.archiviert_am || null,
      bestellungsart: (b.bestellungsart || "material") as BuchhaltungRow["bestellungsart"],
      hat_bestellbestaetigung: b.hat_bestellbestaetigung || false,
      hat_lieferschein: b.hat_lieferschein || false,
      mahnung_am: b.mahnung_am || null,
      mahnung_count: b.mahnung_count || 0,
      bestelldatum: b.bestelldatum,
      kundennummer: b.kundennummer,
      projekt_referenz: b.projekt_referenz,
      ist_gutschrift: b.ist_gutschrift || false,
      bezahlt_bereits: r.bezahlt_bereits ?? null,
      zahlungsmethode: r.zahlungsmethode ?? null,
    });
  }
  return zeilen.sort((a, b) => (b.freigegeben_am ?? "").localeCompare(a.freigegeben_am ?? ""));
}
