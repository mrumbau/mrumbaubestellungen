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

import { logInfo } from "@/lib/logger";
import { amazonParser } from "./amazon";
import {
  VENDOR_CONFIDENCE_THRESHOLD,
  type VendorParser,
  type VendorParseResult,
  type VendorParserInput,
} from "./types";

export type {
  VendorParser,
  VendorParseResult,
  VendorParserInput,
} from "./types";
export { VENDOR_CONFIDENCE_THRESHOLD } from "./types";

/**
 * Registry. Reihenfolge = Priorität. Erster Match gewinnt.
 * Neue Parser hier hinzufügen.
 */
const PARSERS: VendorParser[] = [
  amazonParser,
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
