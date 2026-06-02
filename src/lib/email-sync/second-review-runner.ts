/**
 * Cron-Runner für Adversarial Second-Pass Review.
 *
 * 22.05.2026 — Generischer Silent-Drop-Catcher ohne Vendor-spezifischen Code.
 *
 * Flow:
 *   1. Picks Kandidaten aus email_processing_log:
 *      - has_attachments = true
 *      - bestellung_id IS NULL (nichts angelegt)
 *      - second_review_at IS NULL (nicht schon reviewed)
 *      - created_at letzte 7 Tage
 *      - error_msg NICHT in CLEARLY_IRRELEVANT (DATEV, blacklist, etc.)
 *   2. Lightweight adversarial Metadata-Review (gpt-5.5, ~$0.001/Mail)
 *   3. Bei "vermutlich_dokument" → triggert replayOneMessage (re-fetch + full re-run)
 *   4. Schreibt Ergebnis in second_review_* Spalten
 *
 * Cron: stündlich (alle 60 min). Bei 5-20 Kandidaten/Tag: max 1 Min Laufzeit.
 */

import { createServiceClient } from "@/lib/supabase";
import { logError, logInfo } from "@/lib/logger";
import { runSecondReview } from "@/lib/email-pipeline/second-review";
import { replayOneMessage } from "./replay";

const MAX_BATCH_SIZE = 20;
const MAX_RUN_MS = 55_000; // Vercel-60s-Schutz
const LOOKBACK_DAYS = 7;

/** Skip-Gründe aus First-Pass die DEFINITIV nicht re-reviewed werden sollen. */
const CLEARLY_IRRELEVANT_GROUNDS = new Set<string>([
  "system_domain",
  "system_mail",
  "blacklist",
  "kein_absender",
  "intern",
  "bootstrap_skip",
  "cost_cap_hit",
  "paypal_irrelevant",
  "sicherheitsdatenblatt_reach",
  "juristischer_schriftverkehr",
  "behoerden_genehmigung",
  "plancraft_irrelevant",
  "gelernt_verworfen",
  "domain_oft_verworfen",
]);

export interface SecondReviewRunResult {
  candidates: number;
  reviewed: number;
  agreed_irrelevant: number;
  disagreed: number;
  rerun_succeeded: number;
  rerun_still_no_bestellung: number;
  rerun_failed: number;
  errors: number;
  duration_ms: number;
  truncated: boolean;
}

export async function runSecondReviewCron(): Promise<SecondReviewRunResult> {
  const startTime = Date.now();
  const supabase = createServiceClient();
  const cutoffIso = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const result: SecondReviewRunResult = {
    candidates: 0,
    reviewed: 0,
    agreed_irrelevant: 0,
    disagreed: 0,
    rerun_succeeded: 0,
    rerun_still_no_bestellung: 0,
    rerun_failed: 0,
    errors: 0,
    duration_ms: 0,
    truncated: false,
  };

  // Kandidaten-Query — nutzt den partial index idx_email_log_second_review_candidates
  const { data: candidates, error } = await supabase
    .from("email_processing_log")
    .select("internet_message_id, sender, subject, error_msg, status")
    .is("bestellung_id", null)
    .is("second_review_at", null)
    .eq("has_attachments", true)
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .limit(MAX_BATCH_SIZE * 2); // Buffer für Clearly-Irrelevant-Filter

  if (error) {
    throw new Error(`Second-Review-Kandidaten-Query fehlgeschlagen: ${error.message}`);
  }

  const filtered = (candidates ?? []).filter(
    (c) => !CLEARLY_IRRELEVANT_GROUNDS.has((c.error_msg ?? "").split(":")[0]),
  );
  result.candidates = filtered.length;

  if (filtered.length === 0) {
    result.duration_ms = Date.now() - startTime;
    return result;
  }

  for (const c of filtered.slice(0, MAX_BATCH_SIZE)) {
    if (Date.now() - startTime > MAX_RUN_MS) {
      result.truncated = true;
      break;
    }

    try {
      const review = await runSecondReview({
        email_absender: c.sender ?? "",
        email_betreff: c.subject ?? "",
        email_vorschau: "", // Vorschau nicht in log gespeichert — KI muss aus Subject+Sender entscheiden
        first_pass_grund: c.error_msg ?? c.status ?? "kein_grund",
        anhang_count: 1, // Mindestens 1 (has_attachments=true gefiltert)
      });
      result.reviewed++;

      if (review.agreed_irrelevant) {
        // First-Pass bestätigt → nur Log-Eintrag aktualisieren, kein Re-Run
        await supabase
          .from("email_processing_log")
          .update({
            second_review_at: new Date().toISOString(),
            second_review_agreed: true,
            second_review_verdict: review.verdict,
            second_review_reason: review.reason.slice(0, 500),
            second_review_model: review.model,
            second_review_rerun_outcome: null,
          })
          .eq("internet_message_id", c.internet_message_id);
        result.agreed_irrelevant++;
        continue;
      }

      // Disagreement → Re-Run der Pipeline (Graph-Fetch + ingest)
      result.disagreed++;

      let rerunOutcome = "rerun_failed";
      try {
        const replay = await replayOneMessage(supabase, c.internet_message_id, {
          incrementRetryCount: false,
        });
        if (replay.outcome === "processed" && replay.bestellung_id) {
          rerunOutcome = "rerun_success_bestellung_angelegt";
          result.rerun_succeeded++;
        } else if (replay.outcome === "processed") {
          rerunOutcome = "rerun_kein_bestellung";
          result.rerun_still_no_bestellung++;
        } else {
          rerunOutcome = `rerun_${replay.outcome}`;
          result.rerun_failed++;
        }
      } catch (err) {
        rerunOutcome = "rerun_throw";
        result.rerun_failed++;
        logError("second-review/cron", "Re-Run throw", {
          internet_message_id: c.internet_message_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Log-Eintrag aktualisieren — auch bei Disagreement, damit nicht beim
      // nächsten Cron-Tick nochmal ausgelöst wird (second_review_at gesetzt).
      await supabase
        .from("email_processing_log")
        .update({
          second_review_at: new Date().toISOString(),
          second_review_agreed: false,
          second_review_verdict: review.verdict,
          second_review_reason: review.reason.slice(0, 500),
          second_review_model: review.model,
          second_review_rerun_outcome: rerunOutcome,
        })
        .eq("internet_message_id", c.internet_message_id);
    } catch (err) {
      result.errors++;
      logError("second-review/cron", "Review throw bei einer Mail", {
        internet_message_id: c.internet_message_id,
        error: err instanceof Error ? err.message : String(err),
      });
      // Bei OpenAI-Fehler: NICHT second_review_at setzen → wird beim nächsten
      // Cron-Tick re-versucht. Aber zähle nicht als reviewed.
    }
  }

  result.duration_ms = Date.now() - startTime;

  if (result.reviewed > 0 || result.errors > 0) {
    logInfo("second-review/cron", "Second-Review-Run abgeschlossen", { ...result });
  }

  return result;
}
