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

export default async function PipelineQualityPage() {
  const supabase = await createServerSupabaseClient();
  const { data: rows } = await supabase
    .from("pipeline_quality_daily")
    .select("*")
    .order("date", { ascending: false })
    .limit(30);

  return <PipelineQualityClient rows={(rows || []) as PipelineQualityRow[]} />;
}
