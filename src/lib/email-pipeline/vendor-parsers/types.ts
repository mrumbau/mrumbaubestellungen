/**
 * Vendor-spezifische Pre-Parser für E-Mail-Verarbeitung.
 *
 * Architekturprinzip:
 * - Deterministisch (Regex / HTML-DOM / strukturierte PDF-Layouts)
 * - Pro Vendor genau ein Modul, geschlossener Scope
 * - Liefert dasselbe DokumentAnalyse-Schema wie die KI — Drop-in-Ersatz
 * - Bei Unsicherheit: null zurück, Caller fällt auf KI-Pipeline zurück
 *
 * Ziel: Top-Vendor-Mails mit 99 %+ Genauigkeit + Sub-100 ms Latenz
 * verarbeiten, ohne OpenAI zu involvieren. KI bleibt Fallback für
 * Edge-Cases und unbekannte Sender.
 */

import type { DokumentAnalyse } from "@/lib/openai";

export interface VendorParserInput {
  email_absender: string;
  email_domain: string;
  email_betreff: string;
  /** Plain-Text-Body (HTML wurde bereits gestrippt) */
  email_text: string;
  /** Original-HTML-Body falls vorhanden (manche Parser nutzen DOM-Struktur) */
  email_html?: string | null;
  /** Anhänge als base64 — Parser können selektiv darauf zugreifen */
  anhaenge: Array<{
    name: string;
    mime_type: string;
    base64: string;
  }>;
}

/**
 * Ergebnis eines Vendor-Parsers.
 *
 * `documents` enthält ein oder mehrere DokumentAnalyse-Objekte.
 * Die meisten Parser geben genau 1 Dokument zurück (z.B. Bestellbestätigung).
 * Manche können mehrere liefern (z.B. PayPal: Zahlung + Lieferadresse als 2 Sichten).
 *
 * `konfidenz` (0..1) bewertet die Gesamt-Sicherheit:
 * - 1.0 = alle Pflichtfelder deterministisch extrahiert
 * - 0.7+ = Hauptfelder sicher, einzelne Optional-Felder geschätzt
 * - <0.7 = unsicher, Caller sollte KI-Fallback erwägen
 */
export interface VendorParseResult {
  vendor: string;
  parser_version: string;
  konfidenz: number;
  documents: DokumentAnalyse[];
}

export interface VendorParser {
  /** Stable identifier for telemetry, z.B. "amazon" */
  name: string;
  /** SemVer-artige Version, bumpen wenn Logik substantiell geändert wird */
  version: string;

  /**
   * Schneller Pre-Check ohne expensive Operations.
   * Prüft: passt der Sender / das Subject zu diesem Vendor?
   * Wenn false → Parser wird nicht aufgerufen.
   */
  matches(input: VendorParserInput): boolean;

  /**
   * Eigentliche Extraktion. Kann null zurückgeben wenn Inhalt nicht
   * dem erwarteten Vendor-Format entspricht (z.B. Marketing-Mail
   * eines bekannten Vendors statt Bestellbestätigung).
   *
   * Async, weil manche Parser PDFs streamen müssen.
   */
  parse(input: VendorParserInput): Promise<VendorParseResult | null>;
}

/**
 * Ab welcher Konfidenz das Vendor-Ergebnis ohne KI-Fallback akzeptiert wird.
 * Unter dieser Schwelle: KI wird parallel aufgerufen, die KI-Antwort gewinnt.
 */
export const VENDOR_CONFIDENCE_THRESHOLD = 0.75;
