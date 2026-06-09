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
  /**
   * 09.06.2026 — Per-Mail-Idempotenz für die Mahn-Erkennung. Wenn übergeben,
   * prüft classify-logic vor dem `increment_mahnung`-RPC, ob diese Mail-ID
   * für eine bestimmte Bestellung schon mal als Mahnung gezählt wurde
   * (Spur in email_processing_log: bestellung_id + error_msg='mahnung_markiert').
   * Verhindert dass Backfill/Retry dieselbe Mahn-Mail mehrfach incrementiert.
   */
  internet_message_id?: string | null;
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
  /**
   * Re-Backfill-Idempotenz (05.05.2026): wenn diese Mail einer früheren
   * Pipeline-Run schon einer Bestellung zugeordnet war, wird hier die ID
   * übergeben. Pipeline UPDATEt die existierende Bestellung statt eine neue
   * anzulegen — verhindert Duplikat-Bestellungen beim Re-Backfill.
   */
  existing_bestellung_id?: string | null;
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
  /** Pipeline hat Mail bewusst übersprungen (Duplikat, kein Dokument erkannt etc.). */
  skipped?: boolean;
  /** Skip-Grund (z.B. "duplikat_typ_existiert", "kein_dokument_erkannt"). */
  reason?: string;
  /** Anhang-Statistik: wieviele empfangen, wieviele nach Filter, wieviele analysiert. */
  debug_anhaenge?: { raw_empfangen: number; nach_filter: number; analysiert: number };
  fehler?: string;
}
