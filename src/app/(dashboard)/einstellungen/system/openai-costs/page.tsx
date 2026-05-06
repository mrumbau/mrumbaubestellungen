import { createServerSupabaseClient } from "@/lib/supabase-server";
import { OpenAICostsClient } from "./openai-costs-client";

export const dynamic = "force-dynamic";

const DAYS = 30;

export default async function OpenAICostsPage() {
  // Role-gate handled in parent /einstellungen/system/layout.tsx
  const supabase = await createServerSupabaseClient();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - DAYS);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  const { data: rows } = await supabase
    .from("openai_cost_daily")
    .select("date, source, num_requests, input_tokens, output_tokens, cost_eur")
    .gte("date", cutoffStr)
    .order("date", { ascending: false });

  return <OpenAICostsClient rows={(rows || []) as CostRow[]} days={DAYS} />;
}

export type CostRow = {
  date: string;
  source: string;
  num_requests: number;
  input_tokens: number;
  output_tokens: number;
  cost_eur: number;
};
