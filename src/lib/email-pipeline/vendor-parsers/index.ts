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
export function mergeVendorIntoKi(
  ki: DokumentAnalyse,
  vendor: DokumentAnalyse,
): DokumentAnalyse {
  const merged: DokumentAnalyse = { ...ki };
  const NEVER_MERGE = new Set(["konfidenz", "volltext", "parse_fehler"]);

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

    // Skalare: ki null/undefined/leer → übernimm Vendor-Wert
    if (kiVal === null || kiVal === undefined || kiVal === "") {
      (merged as unknown as Record<string, unknown>)[key] = vendorVal;
    }
  }

  return merged;
}
