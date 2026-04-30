/**
 * Cron-Endpoint: Subscription-Rescue (alle 6h via pg_cron).
 *
 * Heilt verlorene Subscriptions:
 * - consecutive_failures >= 2 (Renewal ging zweimal schief)
 * - ODER expiration_at < NOW() (Subscription bereits abgelaufen)
 *
 * Erstellt eine neue Subscription für den entsprechenden Folder + ersetzt
 * den Eintrag in mail_sync_subscriptions. Während des Outages eingegangene
 * Mails werden NICHT verloren — der Recovery-Pfad ist:
 *   1. Mails kommen weiter in den Outlook-Folder
 *   2. Sobald neue Subscription aktiv: zukünftige Mails per Push
 *   3. Verpasste Mails werden vom optionalen Delta-Fallback geholt
 *      (existing /api/cron/discover-emails kann als Hybrid weiterlaufen)
 *
 * Auth: Bearer CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createSubscription, deleteSubscription } from "@/lib/microsoft-graph/subscriptions";
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

function getNotificationUrl(): string {
  const base = process.env.INTERNAL_APP_URL ?? "https://cloud.mrumbau.de";
  return `${base.replace(/\/$/, "")}/api/webhook/graph-notification`;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const notificationUrl = getNotificationUrl();

  // Kandidaten: failure-marked oder expired
  const { data: broken } = await supabase
    .from("mail_sync_subscriptions")
    .select("id, graph_subscription_id, folder_id, expiration_at, consecutive_failures, mail_sync_folders!inner(graph_folder_id, folder_path, enabled)")
    .or(`consecutive_failures.gte.2,expiration_at.lte.${now}`)
    .limit(10);

  if (!broken || broken.length === 0) {
    return NextResponse.json({ ok: true, rescued: 0, message: "no broken subscriptions" });
  }

  let rescued = 0;
  let failed = 0;
  const results: Array<{ folder_id: string; status: "rescued" | "failed"; error?: string }> = [];

  for (const sub of broken) {
    const folder = (sub as unknown as {
      mail_sync_folders: { graph_folder_id: string; folder_path: string; enabled: boolean };
    }).mail_sync_folders;

    if (!folder?.enabled) {
      // Folder disabled → alte Subscription killen + DB-Eintrag löschen
      try {
        await deleteSubscription(sub.graph_subscription_id);
      } catch { /* best-effort */ }
      await supabase.from("mail_sync_subscriptions").delete().eq("id", sub.id);
      results.push({ folder_id: sub.folder_id, status: "rescued", error: "folder_disabled_cleaned" });
      rescued++;
      continue;
    }

    try {
      // Alte Subscription wegräumen (idempotent — 404 ok)
      await deleteSubscription(sub.graph_subscription_id);

      // Neue Subscription erstellen
      const fresh = await createSubscription({
        folderId: folder.graph_folder_id,
        notificationUrl,
      });

      await supabase
        .from("mail_sync_subscriptions")
        .update({
          graph_subscription_id: fresh.id,
          resource: fresh.resource,
          notification_url: fresh.notificationUrl,
          client_state: fresh.clientState,
          expiration_at: fresh.expirationDateTime,
          last_renewed_at: new Date().toISOString(),
          last_renewal_error: null,
          consecutive_failures: 0,
        })
        .eq("id", sub.id);

      rescued++;
      results.push({ folder_id: sub.folder_id, status: "rescued" });
      logInfo("cron/graph-rescue", "Subscription rescued", {
        folder_path: folder.folder_path,
        old_id: sub.graph_subscription_id,
        new_id: fresh.id,
      });
    } catch (err) {
      failed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      results.push({ folder_id: sub.folder_id, status: "failed", error: errMsg });
      logError("cron/graph-rescue", `Rescue fehlgeschlagen für folder ${folder.folder_path}`, err);
    }
  }

  // Alert bei systematischem Failure
  if (failed > 0 && rescued === 0) {
    await supabase.from("webhook_logs").insert({
      typ: "cron",
      status: "error",
      fehler_text: `Graph-Rescue: ${failed} Versuche, 0 Erfolge. Webhook-URL nicht erreichbar oder Token-Problem? URL: ${notificationUrl}`,
    });
  }

  return NextResponse.json({ ok: true, rescued, failed, results });
}
