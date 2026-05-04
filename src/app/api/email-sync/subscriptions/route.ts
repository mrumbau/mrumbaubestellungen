/**
 * Subscription-Management (Admin-only).
 *
 * GET  → Liste aller Subscriptions mit Status (Diagnose)
 * POST → Initial-Setup: erstellt Subscriptions für alle aktiven Folders
 *        die noch keine haben. Idempotent — re-callable.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getBenutzerProfil, requireRoles } from "@/lib/auth";
import { createSubscription } from "@/lib/microsoft-graph/subscriptions";
import { GraphError } from "@/lib/microsoft-graph/client";
import { logError, logInfo } from "@/lib/logger";
import { ERRORS } from "@/lib/errors";

/** Extrahiert die echte Microsoft-Error-Message aus einem GraphError-responseBody.
 *  Microsoft 400/403 enthalten oft konkrete Hinweise (validation timeout,
 *  notification URL unreachable, ungültige resource etc.) die im plain
 *  `err.message` (nur Status + Code) nicht stehen. */
function describeGraphError(err: unknown): string {
  if (!(err instanceof GraphError)) {
    return err instanceof Error ? err.message : String(err);
  }
  const body = err.responseBody as { error?: { code?: string; message?: string } } | undefined;
  const code = body?.error?.code ?? err.graphCode ?? "UnknownCode";
  const msg = body?.error?.message ?? "(keine Detailmeldung)";
  return `Graph ${err.status} ${code}: ${msg}`;
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getNotificationUrl(): string {
  const base = process.env.INTERNAL_APP_URL ?? "https://cloud.mrumbau.de";
  return `${base.replace(/\/$/, "")}/api/webhook/graph-notification`;
}

export async function GET() {
  const profil = await getBenutzerProfil();
  if (!requireRoles(profil, "admin")) {
    return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("mail_sync_subscriptions")
    .select("id, graph_subscription_id, expiration_at, last_renewed_at, last_renewal_error, consecutive_failures, mail_sync_folders!inner(folder_path, document_hint, enabled)")
    .order("last_renewed_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }

  return NextResponse.json({
    subscriptions: data ?? [],
    notification_url: getNotificationUrl(),
  });
}

export async function POST() {
  const profil = await getBenutzerProfil();
  if (!requireRoles(profil, "admin")) {
    return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
  }

  const supabase = createServiceClient();

  // Aktive Folders ohne Subscription
  const { data: folders } = await supabase
    .from("mail_sync_folders")
    .select(`
      id, graph_folder_id, folder_path, enabled,
      mail_sync_subscriptions(id)
    `)
    .eq("enabled", true);

  if (!folders || folders.length === 0) {
    return NextResponse.json({ ok: true, message: "keine aktiven folders", created: 0 });
  }

  const notificationUrl = getNotificationUrl();
  let created = 0;
  let skipped = 0;
  const failures: Array<{ folder: string; error: string }> = [];

  for (const folder of folders) {
    // Already has subscription → skip
    const existingSubs = (folder as unknown as { mail_sync_subscriptions: Array<{ id: string }> }).mail_sync_subscriptions;
    if (existingSubs && existingSubs.length > 0) {
      skipped++;
      continue;
    }

    if (!folder.graph_folder_id) {
      failures.push({ folder: folder.folder_path, error: "graph_folder_id fehlt" });
      continue;
    }

    try {
      const fresh = await createSubscription({
        folderId: folder.graph_folder_id,
        notificationUrl,
      });

      await supabase.from("mail_sync_subscriptions").insert({
        graph_subscription_id: fresh.id,
        folder_id: folder.id,
        resource: fresh.resource,
        notification_url: fresh.notificationUrl,
        client_state: fresh.clientState,
        expiration_at: fresh.expirationDateTime,
      });

      created++;
      logInfo("/api/email-sync/subscriptions", "Subscription erstellt", {
        folder: folder.folder_path,
        graph_id: fresh.id,
      });
    } catch (err) {
      const errMsg = describeGraphError(err);
      failures.push({ folder: folder.folder_path, error: errMsg });
      logError("/api/email-sync/subscriptions", `Create failed for ${folder.folder_path}`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    notification_url: notificationUrl,
    created,
    skipped,
    failures,
  });
}
