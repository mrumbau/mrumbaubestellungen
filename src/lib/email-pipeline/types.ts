/**
 * Gemeinsame Typen für die E-Mail-Pipeline (Wrapper um existierende Webhook-Routes).
 *
 * Diese Typen entsprechen 1:1 den Body-Strukturen die heute Make.com an
 * /api/webhook/email-check und /api/webhook/email schickt — siehe Make.com
 * Blueprint "Rechnungen-Bestellungen-Bestellwesen".
 */

export interface ClassifyEmailInput {
  email_absender: string;
  email_betreff: string;
  email_vorschau: string;
  hat_anhaenge: boolean;
}

export interface ClassifyEmailResult {
  relevant: boolean;
  grund: string;
  haendler_id?: string;
  haendler_name?: string;
  su_id?: string;
  su_name?: string;
  bestellnummer_betreff?: string | null;
  ki_begruendung?: string | null;
}

export interface EmailAttachment {
  name: string;
  contentType: string;
  /** Base64 */
  contentBytes: string;
}

export interface IngestEmailInput {
  email_absender: string;
  email_betreff: string;
  email_datum: string;
  email_text: string;
  email_vorschau?: string;
  vorfilter?: "ja" | "nein";
  haendler_id?: string;
  haendler_name?: string;
  su_id?: string;
  bestellnummer_betreff?: string | null;
  anhaenge?: EmailAttachment[];
  /** Phase-2-Enhancement: Outlook-Folder-Hint (rechnung/lieferschein/etc.) */
  document_hint?: string | null;
}

export interface IngestEmailResult {
  success: boolean;
  bestellung_id?: string;
  /** Wenn die existierende Pipeline einen Doku-Typ erkannt hat. */
  dokument_typ?: string;
  /** Wenn klassifiziert mit confidence (z.B. via OpenAI). */
  ki_confidence?: number;
  /** Phase 2: 'vendor' wenn ein Vendor-Parser ohne KI-Fallback ausreichte, sonst 'ki'. */
  parser_source?: "vendor" | "ki";
  /** Phase 2: Name des Vendor-Parsers (z.B. 'amazon'). null bei reiner KI. */
  parser_name?: string | null;
  fehler?: string;
}
