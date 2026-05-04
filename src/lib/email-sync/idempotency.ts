/**
 * Idempotenz-Helpers für die E-Mail-Pipeline.
 *
 * Strategie: Vor jeder Mail-Verarbeitung wird ein Claim-Insert in
 * email_processing_log gemacht (PK = internet_message_id). Erfolgt der
 * Insert: wir sind die einzige Instanz die diese Mail verarbeitet.
 * Schlägt er fehl (Conflict): wurde schon (oder gerade gleichzeitig)
 * von einer anderen Instanz/Cron-Tick verarbeitet → skip.
 *
 * Damit ist Doppel-Verarbeitung strukturell unmöglich, auch bei:
 * - Cron-Overlap (zwei Lambdas gleichzeitig)
 * - Make + Cron parallel (während Übergangsphase)
 * - Outlook-Folder-Move (gleiche Mail in zwei Folders auftauchend)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ClaimInput {
  internet_message_id: string;
  graph_message_id: string;
  folder_id: string;
  folder_hint: string | null;
  received_at: string | null;
  sender: string | null;
  subject: string | null;
  has_attachments: boolean;
}

/**
 * Versucht eine Mail zu reservieren. Liefert true wenn diese Instanz
 * sie verarbeiten darf, false wenn schon ein anderer Eintrag existiert.
 */
export async function claimMessage(
  supabase: SupabaseClient,
  input: ClaimInput,
): Promise<boolean> {
  // Postgres ON CONFLICT (PK) DO NOTHING liefert null wenn Konflikt.
  const { data, error } = await supabase
    .from("email_processing_log")
    .insert({
      internet_message_id: input.internet_message_id,
      graph_message_id: input.graph_message_id,
      folder_id: input.folder_id,
      folder_hint: input.folder_hint,
      received_at: input.received_at,
      sender: input.sender,
      subject: input.subject,
      has_attachments: input.has_attachments,
      status: "pending",
    })
    .select("internet_message_id")
    .maybeSingle();

  if (error) {
    // Unique-Violation = bereits verarbeitet → wir bekommen normalerweise null
    // mit maybeSingle. Wenn Postgres explizit Code 23505 wirft, behandeln wir das
    // ebenfalls als "bereits verarbeitet" (kein Fehler, sondern erwartetes Skip).
    if (error.code === "23505") return false;
    throw new Error(`claimMessage Insert-Fehler: ${error.message}`);
  }

  return !!data;
}

/**
 * Markiert einen Log-Eintrag als bootstrap_skip — wird nur beim ersten Sync
 * eines Folders verwendet (delta_token war null), damit existierende Mails
 * nicht reprocessiert werden.
 *
 * F3.B1 Fix: processed_at wird NICHT gesetzt — die Mail wurde nicht durch die
 * Pipeline verarbeitet, sondern beim Bootstrap übergangen. Health-Endpoint
 * `last_processed_at` wäre sonst falsch (würde wirken als hätte die Pipeline
 * frisch gelaufen).
 */
export async function markBootstrapSkip(
  supabase: SupabaseClient,
  internetMessageId: string,
): Promise<void> {
  const { error } = await supabase
    .from("email_processing_log")
    .update({
      status: "irrelevant",
      error_msg: "bootstrap_skip",
      check_at: new Date().toISOString(),
      // processed_at bewusst NICHT gesetzt (siehe F3.B1)
    })
    .eq("internet_message_id", internetMessageId);

  if (error) throw new Error(`markBootstrapSkip Fehler: ${error.message}`);
}

/** Markiert eine Mail als irrelevant nach classify(). */
export async function markIrrelevant(
  supabase: SupabaseClient,
  internetMessageId: string,
  grund: string,
): Promise<void> {
  const { error } = await supabase
    .from("email_processing_log")
    .update({
      status: "irrelevant",
      error_msg: grund,
      check_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
    })
    .eq("internet_message_id", internetMessageId);

  if (error) throw new Error(`markIrrelevant Fehler: ${error.message}`);
}

export interface ProcessedUpdate {
  bestellung_id?: string;
  ki_classified_as?: string;
  ki_confidence?: number;
  /** Phase 2: 'vendor' wenn deterministischer Parser ausreichte, sonst 'ki'. */
  parser_source?: "vendor" | "ki";
  /** Phase 2: Vendor-Parser-Name oder null. */
  parser_name?: string | null;
  /** R5c: Cost-Tracking pro Mail (von withCostTracking aggregiert). */
  openai_input_tokens?: number;
  openai_output_tokens?: number;
  openai_cost_eur?: number;
  /** Diagnose: Pipeline hat Mail bewusst übersprungen — Grund landet in error_msg.
   *  Beispiel: "skipped: duplikat_typ_existiert" oder "skipped: kein_dokument_erkannt". */
  skip_reason?: string;
  /** Diagnose: Anhang-Statistik (raw_empfangen / nach_filter / analysiert). */
  debug_anhaenge?: { raw_empfangen: number; nach_filter: number; analysiert: number };
}

/** Markiert eine Mail als erfolgreich verarbeitet. */
export async function markProcessed(
  supabase: SupabaseClient,
  internetMessageId: string,
  update: ProcessedUpdate = {},
): Promise<void> {
  // Diagnose-String: Skip-Reason + Anhang-Stats kombinieren wenn vorhanden.
  // Macht für die UI / Audit nachvollziehbar warum eine Mail keine Bestellung
  // erzeugt hat (z.B. "skipped: duplikat_typ_existiert | anh: 2 raw → 0 filter").
  const diagnoseTeile: string[] = [];
  if (update.skip_reason) diagnoseTeile.push(`skipped: ${update.skip_reason}`);
  if (update.debug_anhaenge) {
    const a = update.debug_anhaenge;
    diagnoseTeile.push(`anh: ${a.raw_empfangen} raw → ${a.nach_filter} filter → ${a.analysiert} analyse`);
  }
  const errorMsg = diagnoseTeile.length > 0 ? diagnoseTeile.join(" | ").slice(0, 2000) : null;

  const { error } = await supabase
    .from("email_processing_log")
    .update({
      status: "processed",
      check_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
      error_msg: errorMsg,
      bestellung_id: update.bestellung_id ?? null,
      ki_classified_as: update.ki_classified_as ?? null,
      ki_confidence: update.ki_confidence ?? null,
      parser_source: update.parser_source ?? null,
      parser_name: update.parser_name ?? null,
      openai_input_tokens: update.openai_input_tokens ?? null,
      openai_output_tokens: update.openai_output_tokens ?? null,
      openai_cost_eur: update.openai_cost_eur ?? null,
    })
    .eq("internet_message_id", internetMessageId);

  if (error) throw new Error(`markProcessed Fehler: ${error.message}`);
}

/** Markiert eine Mail als fehlgeschlagen. */
export async function markFailed(
  supabase: SupabaseClient,
  internetMessageId: string,
  errorMsg: string,
): Promise<void> {
  const { error } = await supabase
    .from("email_processing_log")
    .update({
      status: "failed",
      error_msg: errorMsg.slice(0, 2000),
      processed_at: new Date().toISOString(),
    })
    .eq("internet_message_id", internetMessageId);

  if (error) throw new Error(`markFailed Fehler: ${error.message}`);
}
