/**
 * Vendor-Parser Dispatcher.
 *
 * Wird von der E-Mail-Pipeline aufgerufen BEVOR die teure KI-Analyse läuft.
 * Iteriert die registrierten Parser, fragt jeden ob er für die Mail zuständig ist,
 * und gibt das Ergebnis des ersten passenden Parsers zurück.
 *
 * Bei niedriger Konfidenz (< VENDOR_CONFIDENCE_THRESHOLD) signalisiert der
 * Dispatcher dass KI-Fallback nötig ist — das Result wird trotzdem als Hint
 * an die KI weitergegeben, damit diese auf den schon gefundenen Daten aufbaut.
 *
 * Reihenfolge der Parser-Registry: spezifischere Parser zuerst (Amazon,
 * Plancraft etc.), generische Parser am Ende (Würth-Style PDF-Pattern).
 */

import { logError, logInfo } from "@/lib/logger";
import { z } from "zod";
import { amazonParser } from "./amazon";
import { raabKarcherParser } from "./raab-karcher";
import { plancraftParser } from "./plancraft";
import { brilluxParser } from "./brillux";
import { fritzBaustoffeParser } from "./fritz-baustoffe";
import { telekomParser } from "./telekom";
import { kauflandParser } from "./kaufland";
import { suedMetallParser } from "./sued-metall";
import { deubaxxlParser } from "./deubaxxl";
import { megabadParser } from "./megabad";
import { feistbaurParser } from "./feistbaur";
import { holdSpadaParser } from "./hold-spada";
import { rexelParser } from "./rexel";
import { check24Parser } from "./check24";
import { microsoftParser } from "./microsoft";
import { shopifyParser } from "./shopify";
import { faspParser } from "./fasp";
import { hamdiMuhametiParser } from "./hamdi-muhameti";
import {
  VENDOR_CONFIDENCE_THRESHOLD,
  type VendorParser,
  type VendorParseResult,
  type VendorParserInput,
} from "./types";

/**
 * F3.D5 Fix: Runtime-Validation des DokumentAnalyse-Schemas. Wenn ein Parser
 * eine kaputte Struktur liefert (z.B. nach Refactor), wird das hier gefangen
 * statt im Pipeline-Inneren als undefined-Property zu crashen.
 *
 * Permissiv: Optional-Felder werden nicht strict geprüft, nur Pflicht-Felder
 * (typ, bestellnummer, konfidenz, artikel-Array, etc.).
 */
const DokumentAnalyseSchema = z.object({
  typ: z.enum([
    "bestellbestaetigung", "lieferschein", "rechnung", "aufmass",
    "leistungsnachweis", "versandbestaetigung", "unbekannt",
  ]),
  bestellnummer: z.string().nullable(),
  auftragsnummer: z.string().nullable(),
  lieferscheinnummer: z.string().nullable(),
  haendler: z.string().nullable(),
  datum: z.string().nullable(),
  artikel: z.array(z.object({
    name: z.string(),
    menge: z.number(),
    einzelpreis: z.number(),
    gesamtpreis: z.number(),
  })),
  gesamtbetrag: z.number().nullable(),
  netto: z.number().nullable(),
  mwst: z.number().nullable(),
  faelligkeitsdatum: z.string().nullable(),
  lieferdatum: z.string().nullable(),
  iban: z.string().nullable(),
  konfidenz: z.number().min(0).max(1),
}).passthrough();

export type {
  VendorParser,
  VendorParseResult,
  VendorParserInput,
} from "./types";
export { VENDOR_CONFIDENCE_THRESHOLD } from "./types";

/**
 * Registry. Reihenfolge = Priorität. Erster Match gewinnt.
 * Spezifische Domain-Matcher zuerst, generische Pattern-Matcher danach.
 */
const PARSERS: VendorParser[] = [
  amazonParser,         // amazon.de etc. — eindeutige Domain
  raabKarcherParser,    // raab-karcher.de / stark-deutschland.de — eindeutige Domain
  brilluxParser,        // brillux.de — Subject-Pattern "Rechnung Nr. XXXXXXX"
  fritzBaustoffeParser, // f-b.gmbh — Subject-Pattern "RechNr: XX/XXXXXXX vom DD.MM.YYYY"
  telekomParser,        // telekom.de — Mobilfunk/Festnetz Geschäftskunden-Rechnungen (abo)
  kauflandParser,       // kaufland-marktplatz.de — Marketplace-Bestellungen mit M-Pattern
  suedMetallParser,     // sued-metall.de — AUF\d{7} Auftragsnummer im Subject
  deubaxxlParser,       // deubaxxl.de — "(Deine|Ihre) Bestellung XXXXXXX" Pattern
  megabadParser,        // megabad.de — 8-digit Bestellnr (8121xxxx), Sender-driven Doku-Typ
  feistbaurParser,      // feistbaur@t-online.de — SU, Sender-Localpart-Match (RechnungsNr im PDF)
  holdSpadaParser,      // hold-spada.com — SU, Subject "<8-digit>, DD.MM.YYYY, Mailversand"
  rexelParser,          // rexel.de — "Rechnung Nr. <digits> vom DD.MM.YYYY - Kunden Nr. <digits>"
  check24Parser,        // check24.de — Plattform-Anker, mehrere Sender-Localparts
  microsoftParser,      // microsoft.com — abo, Billing-Subject-Filter
  shopifyParser,        // shopify.com — abo, Marketing-Domain (email.shopify.com) explizit ausgeschlossen
  faspParser,           // fasp.de — Anwaltskanzlei, Aktenzeichen als bestellnummer (leistungsnachweis)
  hamdiMuhametiParser,  // hmfliesenleger.de — SU, "Rechnung <Nr> <Jahr>" → RE<padded>
  plancraftParser,      // plancraft.com — SU-Rechnungen im Auftrag
];

export interface VendorDispatchResult {
  /** Vom passenden Parser zurückgegeben — ready-to-use DokumentAnalyse-Liste */
  result: VendorParseResult;
  /** True wenn Konfidenz hoch genug ist um KI-Aufruf zu überspringen */
  acceptWithoutKI: boolean;
}

function extractDomain(emailAddress: string): string {
  const match = emailAddress.toLowerCase().match(/@([\w.-]+)$/);
  return match ? match[1] : "";
}

/**
 * Versucht die Mail mit einem registrierten Vendor-Parser zu verarbeiten.
 * Liefert null wenn KEIN Parser zuständig ist oder alle null zurückgeben.
 */
export async function tryParseVendor(
  input: Omit<VendorParserInput, "email_domain"> & { email_domain?: string },
): Promise<VendorDispatchResult | null> {
  const enrichedInput: VendorParserInput = {
    ...input,
    email_domain: input.email_domain || extractDomain(input.email_absender),
  };

  for (const parser of PARSERS) {
    if (!parser.matches(enrichedInput)) continue;

    try {
      const result = await parser.parse(enrichedInput);
      if (!result) continue;

      // F3.D5: Schema-Validation jedes documents Eintrags
      const invalid = result.documents.filter((doc) => !DokumentAnalyseSchema.safeParse(doc).success);
      if (invalid.length > 0) {
        logError("vendor-parsers/dispatch", `${parser.name} liefert kaputtes DokumentAnalyse-Schema`, {
          vendor: parser.name,
          invalid_count: invalid.length,
        });
        // Fallthrough → KI-Pipeline statt korrupte Vendor-Daten zu nutzen
        continue;
      }

      const acceptWithoutKI = result.konfidenz >= VENDOR_CONFIDENCE_THRESHOLD;

      logInfo("vendor-parsers/dispatch", `${parser.name} v${parser.version} matched`, {
        vendor: parser.name,
        version: parser.version,
        konfidenz: result.konfidenz,
        documents: result.documents.length,
        accept_without_ki: acceptWithoutKI,
      });

      return { result, acceptWithoutKI };
    } catch (err) {
      logInfo("vendor-parsers/dispatch", `${parser.name} parse error — falling through to KI`, {
        vendor: parser.name,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
  }

  return null;
}

/**
 * Liste der registrierten Vendor-Namen — für Telemetrie-Aggregation.
 */
export function listRegisteredVendors(): { name: string; version: string }[] {
  return PARSERS.map((p) => ({ name: p.name, version: p.version }));
}

import type { DokumentAnalyse } from "@/lib/openai";

/**
 * R5b/F3.F5: Merge-Helper für Vendor-Hint + KI-Hauptanalyse.
 *
 * Wenn der Vendor-Parser unterhalb des Konfidenz-Schwellwerts liefert, läuft
 * die KI als Hauptanalyse — aber die Vendor-Daten sind trotzdem oft präziser
 * als die KI-Halluzination (z.B. Plancraft liefert sicher die SU-Firma aus
 * dem Subject, KI rät teilweise daneben).
 *
 * Vorher (audit): nur `bestellnummer` und `haendler` wurden gemergt — andere
 * Felder wie `auftragsnummer`, `lieferscheinnummer`, `vermutete_bestellungsart`,
 * `kundennummer` gingen verloren.
 *
 * Jetzt: Generic-Merge — für JEDES Feld gilt "wenn KI null/leer, übernimm
 * Vendor". Ausnahmen:
 *   - `typ`: nur überschreiben wenn KI "unbekannt" ist
 *   - `konfidenz`, `volltext`, `parse_fehler`: NIE überschreiben (KI-Hoheit)
 */
/**
 * 12.05.2026 (A4 Audit-Welle, F-BE-3): Konfidenz-gewichtetes Override.
 * Bei den critical-Extraction-Feldern (Bestellnr, Betrag, IBAN, Daten) gewinnt
 * Vendor-Wert wenn:
 *   - Vendor-Konfidenz >= 0.85 (sehr hoch — typisch Plancraft, Brillux, Amazon)
 *   - KI-Konfidenz <= 0.80 (mittelmäßig — typisch bei verrauschten Templates)
 * Damit überschreibt eine 0.92-Vendor-Bestellnr nicht mehr eine 0.65-KI-
 * Halluzinierte. Bei Confidence-Tie oder beide-hoch: KI gewinnt (Default).
 */
const CRITICAL_OVERRIDE_FIELDS = new Set([
  "bestellnummer",
  "gesamtbetrag",
  "netto",
  "mwst",
  "iban",
  "faelligkeitsdatum",
  "lieferdatum",
  "bestelldatum",
]);
const VENDOR_OVERRIDE_MIN = 0.85;
const KI_OVERRIDE_MAX = 0.8;

export function mergeVendorIntoKi(
  ki: DokumentAnalyse,
  vendor: DokumentAnalyse,
): DokumentAnalyse {
  const merged: DokumentAnalyse = { ...ki };
  const NEVER_MERGE = new Set(["konfidenz", "volltext", "parse_fehler"]);

  // Konfidenz-Werte lesen (default 0 wenn null) — entscheidet welche Felder
  // ein Vendor-Override bekommen.
  const vendorKonfidenz = typeof vendor.konfidenz === "number" ? vendor.konfidenz : 0;
  const kiKonfidenz = typeof ki.konfidenz === "number" ? ki.konfidenz : 1;
  const vendorWinsOnCriticalConflict =
    vendorKonfidenz >= VENDOR_OVERRIDE_MIN && kiKonfidenz <= KI_OVERRIDE_MAX;

  for (const [key, vendorVal] of Object.entries(vendor)) {
    if (NEVER_MERGE.has(key)) continue;
    if (vendorVal === null || vendorVal === undefined) continue;

    const kiVal = (merged as unknown as Record<string, unknown>)[key];

    // Arrays: ki leer → übernimm
    if (Array.isArray(vendorVal)) {
      if (Array.isArray(kiVal) && kiVal.length === 0 && vendorVal.length > 0) {
        (merged as unknown as Record<string, unknown>)[key] = vendorVal;
      }
      continue;
    }

    // typ: spezialfall — nur wenn ki "unbekannt"
    if (key === "typ") {
      if (kiVal === "unbekannt" && vendorVal !== "unbekannt") {
        merged.typ = vendorVal as DokumentAnalyse["typ"];
      }
      continue;
    }

    // Skalare: ki null/undefined/leer → übernimm Vendor-Wert (Default-Verhalten)
    if (kiVal === null || kiVal === undefined || kiVal === "") {
      (merged as unknown as Record<string, unknown>)[key] = vendorVal;
      continue;
    }

    // 12.05.2026 (F-BE-3): bei Konflikt auf Critical-Field + Vendor sehr
    // sicher + KI unsicher → Vendor gewinnt. Verhindert KI-Halluzinationen
    // im Bestellnr/Betrag-Pfad bei klar parsenden Vendoren.
    if (
      vendorWinsOnCriticalConflict &&
      CRITICAL_OVERRIDE_FIELDS.has(key) &&
      kiVal !== vendorVal
    ) {
      (merged as unknown as Record<string, unknown>)[key] = vendorVal;
    }
  }

  return merged;
}
