import { createServerSupabaseClient } from "@/lib/supabase-server";
import { PipelineQualityClient } from "./pipeline-quality-client";

export const dynamic = "force-dynamic";

export type PipelineQualityRow = {
  date: string;
  total_mails: number;
  processed: number;
  irrelevant: number;
  failed: number;
  terminally_failed: number;
  folder_mismatch: number;
  avg_konfidenz: number | null;
  day_cost_eur: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  bestellungen_neu: number;
  ohne_betrag: number;
  ohne_bestellnummer: number;
  prozent_ohne_betrag: number | null;
};

// 15.05.2026 — Incomplete-Extraction-Liste: Bestellungen aus den letzten 14
// Tagen die Pipeline-erkannt sind (haben Bestellnummer + Händler), aber
// keinen Betrag haben. Hilft die "still verschluckten" Mails zu sehen ohne
// dass man manuell die Liste durchblättern muss.
export type IncompleteBestellung = {
  id: string;
  bestellnummer: string | null;
  haendler_name: string | null;
  besteller_name: string | null;
  status: string;
  created_at: string;
  hat_bestellbestaetigung: boolean | null;
  hat_rechnung: boolean | null;
};

// A4.12 (19.05.2026) — Top-20 teuerste Mails der letzten 7 Tage mit
// Drill-Down auf Bestellung. Hilft beim Aufspüren von Mails die ungewöhnlich
// viel OpenAI-Cost erzeugt haben (z.B. fehl-konfigurierter Vendor-Parser,
// adversariale PDFs, Always-KI-Retry-Schleifen).
export type ExpensiveMail = {
  graph_message_id: string;
  subject: string | null;
  sender: string | null;
  status: string;
  parser_source: string | null;
  parser_name: string | null;
  has_attachments: boolean | null;
  openai_cost_eur: number | null;
  openai_input_tokens: number | null;
  openai_output_tokens: number | null;
  bestellung_id: string | null;
  processed_at: string | null;
  created_at: string;
};

// 22.05.2026 — Adversarial Second-Pass-Review-Stats. Zeigt
//   - Reviewed in den letzten 7 Tagen (gesamt)
//   - Davon agreed (KI #1 hatte recht: irrelevant) vs disagreed (Silent-Drop gerettet)
//   - Pending (noch nicht reviewed, Cron wird sie holen)
//   - Letzte Disagreements als Liste mit Link zur Bestellung (wenn Re-Run was angelegt hat)
export type SecondReviewStats = {
  reviewed_7d: number;
  agreed_irrelevant_7d: number;
  disagreed_7d: number;
  rerun_success_7d: number;
  pending_candidates: number;
};

export type SecondReviewDisagreement = {
  internet_message_id: string;
  subject: string | null;
  sender: string | null;
  second_review_at: string;
  second_review_verdict: string | null;
  second_review_reason: string | null;
  second_review_rerun_outcome: string | null;
  bestellung_id: string | null;
  created_at: string;
};

export default async function PipelineQualityPage() {
  const supabase = await createServerSupabaseClient();

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: rows },
    { data: incompleteData },
    { data: expensiveData },
    { data: secondReviewAll },
    { data: secondReviewDisagreementsData },
    { count: pendingCount },
  ] = await Promise.all([
    supabase
      .from("pipeline_quality_daily")
      .select("*")
      .order("date", { ascending: false })
      .limit(30),
    supabase
      .from("bestellungen")
      .select("id, bestellnummer, haendler_name, besteller_name, status, created_at, hat_bestellbestaetigung, hat_rechnung")
      .is("betrag", null)
      .not("bestellnummer", "is", null)
      .not("haendler_name", "is", null)
      .neq("status", "erwartet")
      .gte("created_at", fourteenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(50),
    // A4.12 — Top-20 teuerste Mails 7 Tage. order by openai_cost_eur DESC NULLS LAST.
    supabase
      .from("email_processing_log")
      .select(
        "graph_message_id, subject, sender, status, parser_source, parser_name, has_attachments, openai_cost_eur, openai_input_tokens, openai_output_tokens, bestellung_id, processed_at, created_at",
      )
      .not("openai_cost_eur", "is", null)
      .gt("openai_cost_eur", 0)
      .gte("created_at", sevenDaysAgo)
      .order("openai_cost_eur", { ascending: false, nullsFirst: false })
      .limit(20),
    // 22.05.2026 — Second-Review-Stats: Reviewed-Outcomes der letzten 7 Tage
    supabase
      .from("email_processing_log")
      .select("second_review_agreed, second_review_rerun_outcome, bestellung_id")
      .not("second_review_at", "is", null)
      .gte("second_review_at", sevenDaysAgo),
    // Disagreements für die Detail-Liste (max 10, neueste zuerst)
    supabase
      .from("email_processing_log")
      .select(
        "internet_message_id, subject, sender, second_review_at, second_review_verdict, second_review_reason, second_review_rerun_outcome, bestellung_id, created_at",
      )
      .eq("second_review_agreed", false)
      .gte("second_review_at", sevenDaysAgo)
      .order("second_review_at", { ascending: false })
      .limit(10),
    // Pending: Kandidaten die der Cron beim nächsten Tick reviewen wird
    supabase
      .from("email_processing_log")
      .select("internet_message_id", { count: "exact", head: true })
      .is("bestellung_id", null)
      .is("second_review_at", null)
      .eq("has_attachments", true)
      .gte("created_at", sevenDaysAgo),
  ]);

  // Stats-Aggregation aus rohem Result-Set (kompatibel ohne RPC).
  // 22.05.2026 — Generated DB-Types kennen die neuen second_review_*-Spalten
  // noch nicht (gen-types nicht gelaufen seit Migration). `unknown` Detour um
  // den Cast-Fehler zu umgehen — funktional korrekt.
  type ReviewRow = {
    second_review_agreed: boolean | null;
    second_review_rerun_outcome: string | null;
    bestellung_id: string | null;
  };
  const allReviewed = (secondReviewAll ?? []) as unknown as ReviewRow[];
  const reviewedAgreed = allReviewed.filter((r) => r.second_review_agreed === true).length;
  const reviewedDisagreed = allReviewed.filter((r) => r.second_review_agreed === false).length;
  const rerunSuccess = allReviewed.filter(
    (r) => r.second_review_agreed === false && r.bestellung_id !== null,
  ).length;

  const secondReviewStats: SecondReviewStats = {
    reviewed_7d: allReviewed.length,
    agreed_irrelevant_7d: reviewedAgreed,
    disagreed_7d: reviewedDisagreed,
    rerun_success_7d: rerunSuccess,
    pending_candidates: pendingCount ?? 0,
  };

  return (
    <PipelineQualityClient
      rows={(rows || []) as PipelineQualityRow[]}
      incomplete={(incompleteData || []) as IncompleteBestellung[]}
      expensive={(expensiveData || []) as ExpensiveMail[]}
      secondReviewStats={secondReviewStats}
      secondReviewDisagreements={
        (secondReviewDisagreementsData || []) as unknown as SecondReviewDisagreement[]
      }
    />
  );
}
