/**
 * Vercel-Cron Endpoint: täglich 08:00. Prüft zwei Pipeline-Anomalie-Signale
 * der letzten 7 Tage und schickt eine Email an den Admin (MH) wenn die
 * Schwellenwerte überschritten werden.
 *
 * 18.05.2026 (A1.10) — Aktuell sind silent failures (Bestellungen mit
 * Bestellnr + Händler aber ohne Betrag) im Pipeline-Quality-Dashboard sichtbar,
 * aber niemand schaut täglich da rein. Dieser Cron eskaliert proaktiv.
 *
 * Auth: Bearer CRON_SECRET (analog retry-failed-emails).
 *
 * Idempotenz:
 *   - 1 Alert pro Tag pro Schwellenwert-Typ (incomplete + permanent_failed)
 *   - Check via webhook_logs.created_at > NOW() - INTERVAL '20 hours'
 *   - Damit kein Doppel-Alert wenn der Cron 2× am Tag triggert
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { logError, logInfo } from "@/lib/logger";
import { safeCompare } from "@/lib/safe-compare";
import { ERRORS } from "@/lib/errors";
import { sendeMahnungEmail } from "@/lib/email";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "it@mrumbau.de";
const ADMIN_NAME = "Mohammed Hawrami";
const INCOMPLETE_THRESHOLD = 10;
const PERMANENT_FAILED_THRESHOLD = 5;

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  return safeCompare(bearer, cronSecret);
}

export async function GET(request: NextRequest) {
  return runCron(request);
}

export async function POST(request: NextRequest) {
  return runCron(request);
}

async function runCron(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
  }

  try {
    const sb = createServiceClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Signal 1: Unvollständige Bestellungen (Pipeline hat Bestellnr + Händler
    // erkannt, aber keinen Betrag — heißt KI ist gescheitert ODER ein Stub-
    // Pattern wurde nicht erkannt)
    const { count: incompleteCount } = await sb
      .from("bestellungen")
      .select("id", { count: "exact", head: true })
      .is("betrag", null)
      .not("bestellnummer", "is", null)
      .not("haendler_name", "is", null)
      .neq("status", "erwartet")
      .gte("created_at", sevenDaysAgo);

    // Signal 2: Permanent failed Mails (3× Retry erschöpft)
    const { count: permanentFailedCount } = await sb
      .from("email_processing_log")
      .select("internet_message_id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("retry_count", 3)
      .gte("received_at", sevenDaysAgo);

    const incomplete = incompleteCount ?? 0;
    const permanentFailed = permanentFailedCount ?? 0;
    const triggers: string[] = [];

    if (incomplete > INCOMPLETE_THRESHOLD) triggers.push("incomplete");
    if (permanentFailed > PERMANENT_FAILED_THRESHOLD) triggers.push("permanent_failed");

    logInfo("cron/anomaly-check", "Check abgeschlossen", {
      incomplete, permanentFailed, triggers, thresholds: { INCOMPLETE_THRESHOLD, PERMANENT_FAILED_THRESHOLD },
    });

    if (triggers.length === 0) {
      return NextResponse.json({
        success: true,
        alert_sent: false,
        incomplete, permanent_failed: permanentFailed,
      });
    }

    // Idempotenz: prüfen ob heute schon ein Alert raus ging
    const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
    const { data: recentAlert } = await sb
      .from("webhook_logs")
      .select("id")
      .eq("typ", "anomaly_alert")
      .gte("created_at", twentyHoursAgo)
      .limit(1)
      .maybeSingle();

    if (recentAlert) {
      logInfo("cron/anomaly-check", "Alert übersprungen — schon einer heute raus", {
        existing_alert_id: recentAlert.id,
      });
      return NextResponse.json({
        success: true,
        alert_sent: false,
        skipped_reason: "already_alerted_today",
        incomplete, permanent_failed: permanentFailed,
      });
    }

    // Alert-Email zusammenstellen
    const betreff = `[MR Bestellwesen] Pipeline-Anomalie — ${triggers.join(" + ")}`;
    const textZeilen: string[] = [
      "Die Pipeline hat in den letzten 7 Tagen auffällige Werte erreicht:",
      "",
    ];
    if (incomplete > INCOMPLETE_THRESHOLD) {
      textZeilen.push(
        `• ${incomplete} unvollständige Bestellungen (Bestellnr + Händler erkannt, aber Betrag fehlt) — Schwelle: ${INCOMPLETE_THRESHOLD}`,
      );
    }
    if (permanentFailed > PERMANENT_FAILED_THRESHOLD) {
      textZeilen.push(
        `• ${permanentFailed} permanent failed E-Mails (3× Retry erschöpft) — Schwelle: ${PERMANENT_FAILED_THRESHOLD}`,
      );
    }
    textZeilen.push(
      "",
      "Details: https://cloud.mrumbau.de/einstellungen/system/pipeline-quality",
      "",
      "Diese Mail wird einmal pro Tag automatisch versendet wenn ein Schwellenwert überschritten ist.",
    );

    const result = await sendeMahnungEmail({
      empfaengerEmail: ADMIN_EMAIL,
      empfaengerName: ADMIN_NAME,
      betreff,
      text: textZeilen.join("\n"),
    });

    // Alert-Eintrag in webhook_logs für Idempotenz + Verlauf
    await sb.from("webhook_logs").insert({
      typ: "anomaly_alert",
      status: result.success ? "success" : "error",
      fehler_text: `Triggers: ${triggers.join(",")} | incomplete=${incomplete}/${INCOMPLETE_THRESHOLD} | permanent_failed=${permanentFailed}/${PERMANENT_FAILED_THRESHOLD}${result.error ? ` | mail_error=${result.error}` : ""}`,
    });

    if (!result.success) {
      logError("cron/anomaly-check", "Alert-Mail Versand fehlgeschlagen", { error: result.error });
    }

    return NextResponse.json({
      success: true,
      alert_sent: result.success,
      triggers,
      incomplete,
      permanent_failed: permanentFailed,
    });
  } catch (err) {
    logError("cron/anomaly-check", "Cron-Fehler", err);
    return NextResponse.json(
      { error: ERRORS.INTERNER_FEHLER, details: err instanceof Error ? err.message : null },
      { status: 500 },
    );
  }
}
