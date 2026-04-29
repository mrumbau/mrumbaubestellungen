/**
 * GET /api/email-sync/telemetry
 *
 * Aggregate für Tab "Telemetrie":
 * - daily_spend: pro Tag der letzten 30 Tage Σ openai_cost_eur
 * - status_counts: Anzahl pro Status (letzte 30 Tage)
 * - mismatch_rate: % Mails wo folder_hint != ki_classified_as
 * - top_costly: Top 10 teuerste Mails letzte 30 Tage
 * - folder_health: pro Folder last_sync_at, last_error, mail_count_24h
 *
 * Admin-only.
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil, requireRoles } from "@/lib/auth";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const profil = await getBenutzerProfil();
  if (!requireRoles(profil, "admin")) {
    return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
  }

  const supabase = await createServerSupabaseClient();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    // F3.E11: Limit als OOM-Safety-Net (~50k = 50d × 1000 Mails). Bei Skalierung
    // > 50k/30d wäre DB-side Aggregation via SQL-View / RPC nötig.
    const [logsRes, foldersRes] = await Promise.all([
      supabase
        .from("email_processing_log")
        .select(
          "openai_cost_eur, status, folder_mismatch, sender, subject, created_at, internet_message_id, parser_source, parser_name",
        )
        .gte("created_at", since30d)
        .order("created_at", { ascending: false })
        .limit(50_000),
      supabase
        .from("mail_sync_folders")
        .select("id, folder_name, folder_path, enabled, last_sync_at, last_sync_count, last_error"),
    ]);

    const logs = logsRes.data ?? [];
    const folders = foldersRes.data ?? [];

    // Daily Spend (30 buckets)
    const dailyMap = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      dailyMap.set(key, 0);
    }
    for (const log of logs) {
      if (!log.openai_cost_eur || !log.created_at) continue;
      const key = log.created_at.slice(0, 10);
      if (dailyMap.has(key)) {
        dailyMap.set(key, (dailyMap.get(key) ?? 0) + Number(log.openai_cost_eur));
      }
    }
    const daily_spend = Array.from(dailyMap.entries()).map(([date, eur]) => ({
      date,
      eur: Math.round(eur * 10000) / 10000,
    }));

    // Status counts
    const status_counts: Record<string, number> = {
      pending: 0,
      irrelevant: 0,
      processed: 0,
      failed: 0,
    };
    let mismatchCount = 0;
    let totalClassified = 0;
    let totalCostEur = 0;
    for (const log of logs) {
      const s = log.status as string;
      if (status_counts[s] !== undefined) status_counts[s]++;
      if (log.folder_mismatch === true) mismatchCount++;
      if (log.folder_mismatch !== null) totalClassified++;
      if (log.openai_cost_eur) totalCostEur += Number(log.openai_cost_eur);
    }
    const mismatch_rate = totalClassified > 0 ? mismatchCount / totalClassified : 0;

    // Top costly (sortiert)
    const top_costly = [...logs]
      .filter((l) => l.openai_cost_eur && Number(l.openai_cost_eur) > 0)
      .sort((a, b) => Number(b.openai_cost_eur) - Number(a.openai_cost_eur))
      .slice(0, 10)
      .map((l) => ({
        internet_message_id: l.internet_message_id,
        sender: l.sender,
        subject: l.subject,
        cost_eur: Number(l.openai_cost_eur),
        created_at: l.created_at,
      }));

    // Folder health: count mails per folder in last 24h
    const folder24hCount = new Map<string, number>();
    for (const log of logs) {
      if (log.created_at && log.created_at >= since24h) {
        // need folder_id — re-fetch separately
      }
    }
    // Cleaner: separate query for folder counts
    const { data: folderCounts } = await supabase
      .from("email_processing_log")
      .select("folder_id")
      .gte("created_at", since24h);
    for (const fc of folderCounts ?? []) {
      const id = (fc as { folder_id: string }).folder_id;
      folder24hCount.set(id, (folder24hCount.get(id) ?? 0) + 1);
    }

    const folder_health = folders.map((f) => ({
      id: f.id,
      folder_name: f.folder_name,
      folder_path: f.folder_path,
      enabled: f.enabled,
      last_sync_at: f.last_sync_at,
      last_sync_count: f.last_sync_count,
      last_error: f.last_error,
      mails_24h: folder24hCount.get(f.id) ?? 0,
    }));

    // Parser-Quelle Aggregat (Phase 2 Vendor-Parser-Telemetrie)
    let parserVendorCount = 0;
    let parserKiCount = 0;
    const parserByVendor: Record<string, number> = {};
    let kiCostSum = 0;
    let kiCostN = 0;
    for (const log of logs) {
      const src = (log as { parser_source?: string | null }).parser_source;
      const name = (log as { parser_name?: string | null }).parser_name;
      if (src === "vendor") {
        parserVendorCount++;
        if (name) parserByVendor[name] = (parserByVendor[name] ?? 0) + 1;
      } else if (src === "ki") {
        parserKiCount++;
        if (log.openai_cost_eur && Number(log.openai_cost_eur) > 0) {
          kiCostSum += Number(log.openai_cost_eur);
          kiCostN++;
        }
      }
    }
    const avgKiCostEur = kiCostN > 0 ? kiCostSum / kiCostN : 0;
    const estimatedSavingsEur = avgKiCostEur * parserVendorCount;
    const parserVendorRate =
      parserVendorCount + parserKiCount > 0
        ? parserVendorCount / (parserVendorCount + parserKiCount)
        : 0;

    return NextResponse.json({
      daily_spend,
      status_counts,
      mismatch_rate,
      total_cost_30d_eur: Math.round(totalCostEur * 100) / 100,
      total_mails_30d: logs.length,
      top_costly,
      folder_health,
      parser: {
        vendor_count: parserVendorCount,
        ki_count: parserKiCount,
        vendor_rate: parserVendorRate,
        avg_ki_cost_eur: Math.round(avgKiCostEur * 10000) / 10000,
        estimated_savings_eur: Math.round(estimatedSavingsEur * 100) / 100,
        by_vendor: parserByVendor,
      },
    });
  } catch (err) {
    logError("email-sync/telemetry", "Aggregate-Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
