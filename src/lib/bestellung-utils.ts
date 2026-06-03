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
  // 22.05.2026 — bestellnummer_match / bestellnummer_match_gpt / signal_4h
  // entfernt (Chrome-Extension stillgelegt). Historische Werte mit diesen
  // Methoden bekommen den Fallback ?? 0.5 — vertretbar weil die Methode in
  // der UI nur als label gerendert wird, nicht als Filter-Kriterium.
  const methodeBase: Record<string, number> = {
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

/**
 * Display-Priorität für die Bestellungs-Anzeige in der UI.
 *
 * 08.05.2026 — Reihenfolge: Auftragsnummer > Bestellnummer (sofern KEINE
 * Lieferscheinnummer) > "Ohne Nr.". Lieferscheinnummern dürfen niemals als
 * Hauptidentifikation angezeigt werden, weil eine Bestellung mehrere LS
 * haben kann und die LS-Nr keine stabile Bestell-Identität ist.
 *
 * Defense-in-Depth gegen historische Daten in denen die Pipeline die LS-Nr
 * fälschlich als bestellnummer gesetzt hat.
 */
export function displayBestellnummer(b: {
  bestellnummer?: string | null;
  auftragsnummer?: string | null;
  lieferscheinnummer?: string | null;
}): string {
  if (b.auftragsnummer) return b.auftragsnummer;
  if (b.bestellnummer && b.bestellnummer !== b.lieferscheinnummer) {
    return b.bestellnummer;
  }
  return "Ohne Nr.";
}

// =====================================================================
// Status-Berechnung (dynamisch nach Bestellungsart)
// =====================================================================

/**
 * Pool-Invariant — Material-Bestellungen ohne Besteller dürfen nicht in
 * Workflow-Endzustände (`vollstaendig`, `freigegeben`) wandern.
 *
 * 03.06.2026 (Phase 3 Logik-Härtung): Drift-Vorbeugung nach Repair von 2
 * Records am 03.06.2026, die das Symptom zeigten — Material-Bestellungen
 * mit `besteller_kuerzel='UNBEKANNT'` standen auf `vollstaendig`. Effekt:
 *   - Pool-Tab zeigte sie nicht (filtert nach UNBEKANNT, aber Workflow
 *     erwartet sie schon abgeschlossen → Inkonsistenz).
 *   - Buchhaltung sah Doku-vollständige Bestellungen ohne Besteller.
 *   - Beim Claim wäre keine Status-Korrektur passiert.
 *
 * Regel: Pool-Items (Material + UNBEKANNT) sind workflow-mäßig immer offen
 * (bzw. `abweichung`/`ls_fehlt` wenn Pipeline das ableitet). `vollstaendig`
 * und `freigegeben` setzen einen claim'd Besteller voraus.
 *
 * Subunternehmer / Abo sind per Definition nicht claim-pflichtig — sie
 * gehen direkt durch.
 *
 * Defense-in-Depth: DB-Trigger `enforce_pool_invariant` blockt zusätzlich
 * jeden UPDATE/INSERT, der die Regel verletzt — falls künftiger Code-Pfad
 * den Helper hier umgeht.
 */
export function enforcePoolInvariant(
  art: string | null | undefined,
  besteller_kuerzel: string | null | undefined,
  gewuenschterStatus: BestellStatus,
): { allowed: boolean; effectiveStatus: BestellStatus; reason?: string } {
  const istPoolItem =
    (art ?? "material") === "material" && besteller_kuerzel === "UNBEKANNT";
  if (!istPoolItem) {
    return { allowed: true, effectiveStatus: gewuenschterStatus };
  }
  if (gewuenschterStatus === "vollstaendig" || gewuenschterStatus === "freigegeben") {
    return {
      allowed: false,
      effectiveStatus: "offen",
      reason: `Pool-Invariant: Material-Bestellung ohne Besteller darf nicht auf '${gewuenschterStatus}' — capped auf 'offen'.`,
    };
  }
  return { allowed: true, effectiveStatus: gewuenschterStatus };
}

/**
 * F5.1 Fix: Sicherer Status-Update für `bestellungen.status`.
 * Lädt aktuellen Status, validiert Übergang via `checkTransition`, und
 * UPDATEs nur wenn erlaubt. Bei freigegeben-Bestellungen passiert NICHTS
 * (kein Rollback). Loggt Verstöße via logError.
 *
 * 03.06.2026 — Plus Pool-Invariant: refuses Übergänge nach vollstaendig/
 * freigegeben für UNBEKANNT-Material.
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
    .select("status, bestellungsart, besteller_kuerzel")
    .eq("id", bestellungId)
    .maybeSingle();

  if (!row) {
    return { updated: false, reason: "bestellung_nicht_gefunden" };
  }

  if (row.status === neuerStatus) {
    return { updated: true, from: row.status }; // idempotent
  }

  // Pool-Invariant zuerst — Refusal ist hier strikter als Status-Transition.
  const pool = enforcePoolInvariant(row.bestellungsart, row.besteller_kuerzel, neuerStatus);
  if (!pool.allowed) {
    logError("status-machine", pool.reason ?? "pool_invariant_violation", {
      bestellungId,
      from: row.status,
      to: neuerStatus,
      context,
    });
    return { updated: false, from: row.status, reason: pool.reason };
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
 *
 * 03.06.2026 — Pool-Invariant: UNBEKANNT-Material wird auf 'offen' gecapped
 * auch wenn alle Dokumente da sind. Status springt auf 'vollstaendig' erst
 * nach Pool-Claim (= besteller_kuerzel != 'UNBEKANNT').
 */
export async function updateBestellungStatus(
  supabase: SupabaseClient,
  bestellungId: string
): Promise<string> {
  const { data: bestellung } = await supabase
    .from("bestellungen")
    .select("status, bestellungsart, besteller_kuerzel, hat_bestellbestaetigung, hat_lieferschein, hat_rechnung, hat_aufmass, hat_leistungsnachweis, hat_versandbestaetigung")
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

  let neuerStatus: BestellStatus = alleErfuellt ? "vollstaendig" : "offen";

  // Pool-Invariant: UNBEKANNT-Material bleibt 'offen' auch bei vollständigen
  // Dokumenten — der Claim muss zuerst erfolgen.
  const pool = enforcePoolInvariant(art, bestellung.besteller_kuerzel, neuerStatus);
  if (!pool.allowed) {
    neuerStatus = pool.effectiveStatus;
    // Bewusst KEIN logError — das ist erwartetes Verhalten für Pool-Items,
    // kein Pipeline-Bug. Wenn jemand Diagnose will, schaut er auf
    // besteller_kuerzel='UNBEKANNT'.
  }

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
