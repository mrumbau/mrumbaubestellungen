import type { SupabaseClient } from "@supabase/supabase-js";

// =====================================================================
// Bestellungsart: Material vs. Subunternehmer
// =====================================================================

export type Bestellungsart = "material" | "subunternehmer" | "abo";

export interface DokumentAnforderung {
  flag: string;
  typ: string;
  label: string;
  kurzLabel: string;
  erforderlich: boolean;
}

export const DOKUMENT_CONFIG: Record<Bestellungsart, DokumentAnforderung[]> = {
  material: [
    { flag: "hat_bestellbestaetigung", typ: "bestellbestaetigung", label: "Bestätigung", kurzLabel: "Best.", erforderlich: true },
    { flag: "hat_lieferschein", typ: "lieferschein", label: "Lieferschein", kurzLabel: "LS", erforderlich: true },
    { flag: "hat_rechnung", typ: "rechnung", label: "Rechnung", kurzLabel: "RE", erforderlich: true },
    { flag: "hat_versandbestaetigung", typ: "versandbestaetigung", label: "Versand", kurzLabel: "VS", erforderlich: false },
  ],
  subunternehmer: [
    { flag: "hat_rechnung", typ: "rechnung", label: "Rechnung", kurzLabel: "RE", erforderlich: true },
    { flag: "hat_aufmass", typ: "aufmass", label: "Aufmaß", kurzLabel: "AM", erforderlich: false },
    { flag: "hat_leistungsnachweis", typ: "leistungsnachweis", label: "Leistungsnachweis", kurzLabel: "LN", erforderlich: false },
  ],
  abo: [
    { flag: "hat_rechnung", typ: "rechnung", label: "Rechnung", kurzLabel: "RE", erforderlich: true },
  ],
};

export const BESTELLUNGSART_LABELS: Record<Bestellungsart, string> = {
  material: "Material",
  subunternehmer: "Subunternehmer",
  abo: "Abo / Vertrag",
};

export const GEWERKE = [
  "Elektro",
  "Sanitär/Heizung",
  "Trockenbau",
  "Maler/Lackierer",
  "Estrich",
  "Fliesen",
  "Bodenbelag",
  "Schreiner/Tischler",
  "Schlosser/Metallbau",
  "Fenster/Türen",
  "Dachdecker",
  "Reinigung",
  "Abbruch/Entsorgung",
  "Sonstiges",
] as const;

export type Gewerk = (typeof GEWERKE)[number];

// =====================================================================
// Status-Berechnung (dynamisch nach Bestellungsart)
// =====================================================================

/**
 * Berechnet und aktualisiert den Status einer Bestellung
 * basierend auf vorhandenen Dokumenten und der Bestellungsart.
 * Wird in webhook/email und scan verwendet.
 */
export async function updateBestellungStatus(
  supabase: SupabaseClient,
  bestellungId: string
): Promise<string> {
  const { data: bestellung } = await supabase
    .from("bestellungen")
    .select("status, bestellungsart, hat_bestellbestaetigung, hat_lieferschein, hat_rechnung, hat_aufmass, hat_leistungsnachweis, hat_versandbestaetigung")
    .eq("id", bestellungId)
    .maybeSingle();

  if (!bestellung) {
    return "offen";
  }

  // "freigegeben" und "abweichung" nie automatisch überschreiben.
  // Abweichung muss manuell geprüft und aufgelöst werden (z.B. Abo-Betragsabweichung).
  if (bestellung.status === "freigegeben" || bestellung.status === "abweichung") {
    return bestellung.status;
  }

  const art: Bestellungsart = bestellung.bestellungsart || "material";
  const anforderungen = DOKUMENT_CONFIG[art];

  const alleErfuellt = anforderungen
    .filter((a) => a.erforderlich)
    .every((a) => bestellung[a.flag as keyof typeof bestellung] === true);

  const neuerStatus = alleErfuellt ? "vollstaendig" : "offen";

  await supabase
    .from("bestellungen")
    .update({ status: neuerStatus })
    .eq("id", bestellungId);

  return neuerStatus;
}
