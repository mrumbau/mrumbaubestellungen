/**
 * POST /api/cron/sync-openai-costs
 *
 * Welle 2 — O3 (06.05.2026): OpenAI-Usage-Sync.
 *
 * Aggregiert die letzten N Tage `email_processing_log` (App-Side-Tracking) in
 * die `openai_usage_daily`-Tabelle als Single-Source-of-Truth. Optional kann
 * später die OpenAI Usage API ergänzend gepollt werden — dann entstehen 2
 * Quellen (`source='app_tracking'` und `source='openai_api'`) die kreuz-
 * validiert werden können.
 *
 * Heute: nur App-Tracking-Aggregation. OpenAI Usage API erfordert Admin-
 * API-Key + manuellen Setup, deshalb deferred.
 *
 * Auth: Bearer CRON_SECRET (Vercel-Cron-Standard).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { logError, logInfo } from "@/lib/logger";
import { safeCompare } from "@/lib/safe-compare";

const ROUTE_TAG = "/api/cron/sync-openai-costs";

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  return safeCompare(bearer, cronSecret);
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const url = new URL(request.url);
    const tageParam = url.searchParams.get("tage");
    const tage = tageParam ? Math.max(1, Math.min(90, parseInt(tageParam, 10))) : 7;
    const cutoff = new Date(Date.now() - tage * 24 * 60 * 60 * 1000).toISOString();

    // Aggregiere email_processing_log nach Tag (Date-Truncation in JS — kompatibel ohne RPC)
    const { data: rows, error } = await supabase
      .from("email_processing_log")
      .select("created_at, openai_input_tokens, openai_output_tokens, openai_cost_eur")
      .gte("created_at", cutoff)
      .not("openai_cost_eur", "is", null);

    if (error) {
      logError(ROUTE_TAG, "DB-Query-Fehler", error);
      return NextResponse.json({ error: "DB-Fehler" }, { status: 500 });
    }

    const buckets = new Map<string, { input: number; output: number; eur: number; calls: number }>();
    for (const r of rows ?? []) {
      const tag = (r.created_at as string).slice(0, 10);
      const b = buckets.get(tag) ?? { input: 0, output: 0, eur: 0, calls: 0 };
      b.input += Number(r.openai_input_tokens ?? 0);
      b.output += Number(r.openai_output_tokens ?? 0);
      b.eur += Number(r.openai_cost_eur ?? 0);
      b.calls += 1;
      buckets.set(tag, b);
    }

    // Upsert in openai_usage_daily mit source='app_tracking' und model='aggregated'
    // (Pro-Modell-Breakdown bleibt im email_processing_log; tägliche Roll-up ohne Modell-Detail)
    const upsertRows = [...buckets.entries()].map(([date, b]) => ({
      date,
      model: "aggregated",
      source: "app_tracking",
      input_tokens: b.input,
      output_tokens: b.output,
      cost_eur: Math.round(b.eur * 10000) / 10000,
      cost_usd: 0,
      num_requests: b.calls,
      synced_at: new Date().toISOString(),
    }));

    if (upsertRows.length > 0) {
      const { error: upsertError } = await supabase
        .from("openai_usage_daily")
        .upsert(upsertRows, { onConflict: "date,model,source" });

      if (upsertError) {
        logError(ROUTE_TAG, "Upsert-Fehler", upsertError);
        return NextResponse.json({ error: "Upsert-Fehler", details: upsertError.message }, { status: 500 });
      }
    }

    logInfo(ROUTE_TAG, `Sync abgeschlossen: ${upsertRows.length} Tage aggregiert`, {
      tage,
      total_eur: upsertRows.reduce((sum, r) => sum + r.cost_eur, 0).toFixed(4),
      total_calls: upsertRows.reduce((sum, r) => sum + r.num_requests, 0),
    });

    return NextResponse.json({
      success: true,
      tage,
      tage_aggregiert: upsertRows.length,
      gesamt_eur: upsertRows.reduce((sum, r) => sum + r.cost_eur, 0),
      gesamt_calls: upsertRows.reduce((sum, r) => sum + r.num_requests, 0),
    });
  } catch (err) {
    logError(ROUTE_TAG, "Unerwarteter Fehler", err);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
