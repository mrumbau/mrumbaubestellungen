/**
 * Cron-Endpoint: Subscription-Renewal (alle 12h via pg_cron).
 *
 * Verlängert Subscriptions mit <24h Restzeit. Bei 404 (Subscription gedropt):
 * `consecutive_failures` hochzählen → graph-rescue legt sie neu an.
 *
 * Auth: Bearer CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { renewSubscription } from "@/lib/microsoft-graph/subscriptions";
import { GraphError } from "@/lib/microsoft-graph/client";
import { logError, logInfo } from "@/lib/logger";
import { safeCompare } from "@/lib/safe-compare";
import { ERRORS } from "@/lib/errors";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  return safeCompare(bearer, cronSecret);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
  }

  const supabase = createServiceClient();
  // Subscriptions die in <24h ablaufen → renewal nötig
  const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data: subs } = await supabase
    .from("mail_sync_subscriptions")
    .select("id, graph_subscription_id, expiration_at, consecutive_failures")
    .lte("expiration_at", cutoff)
    .order("expiration_at", { ascending: true })
    .limit(20);

  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: true, renewed: 0, message: "no subscriptions due" });
  }

  let renewed = 0;
  let failed = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (const sub of subs) {
    try {
      const updated = await renewSubscription(sub.graph_subscription_id);
      await supabase
        .from("mail_sync_subscriptions")
        .update({
          expiration_at: updated.expirationDateTime,
          last_renewed_at: new Date().toISOString(),
          last_renewal_error: null,
          consecutive_failures: 0,
        })
        .eq("id", sub.id);
      renewed++;
    } catch (err) {
      failed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      const is404 = err instanceof GraphError && err.status === 404;
      // 404 = Subscription gedropt → markiere für Rescue
      await supabase
        .from("mail_sync_subscriptions")
        .update({
          last_renewal_error: errMsg.slice(0, 500),
          consecutive_failures: (sub.consecutive_failures ?? 0) + 1,
        })
        .eq("id", sub.id);
      failures.push({ id: sub.graph_subscription_id, error: is404 ? "404_dropped" : errMsg });
      logError("cron/graph-renew", `Renewal fehlgeschlagen für ${sub.graph_subscription_id}`, err);
    }
  }

  // Alert bei systematischem Failure
  if (failed > 0 && renewed === 0) {
    await supabase.from("webhook_logs").insert({
      typ: "cron",
      status: "error",
      fehler_text: `Graph-Renewal: ${failed} Versuche, 0 Erfolge. Mögliche Ursachen: Token abgelaufen, Webhook-URL nicht erreichbar, Microsoft-Outage.`,
    });
  }

  logInfo("cron/graph-renew", "Renewal-Run abgeschlossen", { renewed, failed, total: subs.length });

  return NextResponse.json({ ok: true, renewed, failed, failures });
}
