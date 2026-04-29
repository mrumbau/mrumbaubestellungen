import type { SupabaseClient } from "@supabase/supabase-js";
import { logError } from "./logger";
import { checkTransition, type BestellStatus } from "./status-machine";

// =====================================================================
// F4.18: Confidence-Aggregation
//
// End-to-End-Confidence einer Pipeline-Run basierend auf Zuordnungs-Methode
// und (optional) KI-Konfidenz. Liefert einen Score [0..1] für Diagnose und
// ggf. UI-Filter ("low-confidence Bestellungen reviewen").
// =====================================================================

/** Aggregiert Pipeline-Confidence. Methode dominiert, KI-Konfidenz justiert. */
export function aggregatePipelineConfidence(
  zuordnungsMethode: string,
  kiKonfidenz?: number | null,
): number {
  const methodeBase: Record<string, number> = {
    bestellnummer_match: 1.0,
    bestellnummer_match_gpt: 0.95,
    signal_4h: 0.92,
    besteller_im_dokument: 0.85,
    name_im_text: 0.78,
    ki_historisch: 0.72,
    haendler_affinitaet: 0.65,
    unbekannt: 0.0,
  };
  const base = methodeBase[zuordnungsMethode] ?? 0.5;
  // KI-Konfidenz dämpft (geometrisches Mittel) wenn Methode KI-basiert ist
  if (zuordnungsMethode === "ki_historisch" && typeof kiKonfidenz === "number") {
    return Math.sqrt(base * Math.max(0, Math.min(1, kiKonfidenz)));
  }
  return base;
}

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
 * F5.1 Fix: Sicherer Status-Update für `bestellungen.status`.
 * Lädt aktuellen Status, validiert Übergang via `checkTransition`, und
 * UPDATEs nur wenn erlaubt. Bei freigegeben-Bestellungen passiert NICHTS
 * (kein Rollback). Loggt Verstöße via logError.
 *
 * Nutzen: an Stellen die bestellungen.status setzen, statt direkt
 * `update({status: X})` aufzurufen.
 */
export async function safeUpdateStatus(
  supabase: SupabaseClient,
  bestellungId: string,
  neuerStatus: BestellStatus,
  context?: string,
): Promise<{ updated: boolean; from?: string; reason?: string }> {
  const { data: row } = await supabase
    .from("bestellungen")
    .select("status")
    .eq("id", bestellungId)
    .maybeSingle();

  if (!row) {
    return { updated: false, reason: "bestellung_nicht_gefunden" };
  }

  if (row.status === neuerStatus) {
    return { updated: true, from: row.status }; // idempotent
  }

  const result = checkTransition(row.status as BestellStatus, neuerStatus, context);
  if (!result.valid) {
    return { updated: false, from: row.status, reason: result.reason };
  }

  await supabase
    .from("bestellungen")
    .update({ status: neuerStatus, updated_at: new Date().toISOString() })
    .eq("id", bestellungId);

  return { updated: true, from: row.status };
}

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
    logError("updateBestellungStatus", "Bestellung nicht gefunden", { bestellungId });
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

  // R3c/F5.1: Status-Übergang validieren + bei Verstoß loggen.
  // Wirft NICHT — Pipeline-Backward-Compat. DB-Trigger blockt dafür den
  // einzigen wirklich kritischen Übergang (freigegeben rückwärts).
  checkTransition(bestellung.status as BestellStatus, neuerStatus, "updateBestellungStatus");

  await supabase
    .from("bestellungen")
    .update({ status: neuerStatus })
    .eq("id", bestellungId);

  return neuerStatus;
}
