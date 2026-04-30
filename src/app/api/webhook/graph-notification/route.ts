/**
 * Microsoft Graph Push-Notification Webhook.
 *
 * Zwei Modi:
 *
 * 1. **Subscription-Validation (Initial-Handshake):**
 *    Microsoft sendet GET (oder POST) mit `?validationToken=xxx`.
 *    Wir antworten mit dem Token unverändert als text/plain.
 *    Microsoft akzeptiert die Subscription erst nach Echo.
 *
 * 2. **Notification-Empfang:**
 *    Microsoft sendet POST mit JSON-Body:
 *    {
 *      "value": [{
 *        "subscriptionId": "...",
 *        "subscriptionExpirationDateTime": "...",
 *        "changeType": "created",
 *        "resource": "users/info@mrumbau.de/messages/{id}",
 *        "resourceData": { "id": "...", "@odata.type": "#Microsoft.Graph.Message", ... },
 *        "clientState": "..." // unser Token aus mail_sync_subscriptions
 *      }]
 *    }
 *    Wir validieren clientState gegen DB → fan-out an /api/cron/process-one
 *    via Idempotenz-Claim (graph_message_id).
 *
 * Fehler-Toleranz: Microsoft retried bei 5xx/Timeout. Bei 200 OK ist die
 * Notification "consumed" — also nur 200 returnieren wenn wir den Claim
 * gemacht haben oder die Notification erkennbar Duplicate ist.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { graphFetch } from "@/lib/microsoft-graph/client";
import { claimMessage } from "@/lib/email-sync/idempotency";
import { logError, logInfo, withRequestId } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // Notifications müssen schnell quittiert werden

interface NotificationPayload {
  value: Array<{
    subscriptionId: string;
    subscriptionExpirationDateTime: string;
    changeType: string;
    resource: string;
    resourceData?: { id?: string };
    clientState?: string;
    tenantId?: string;
  }>;
  validationTokens?: string[];
}

interface OutlookMessage {
  id: string;
  internetMessageId: string;
  receivedDateTime: string;
  subject: string;
  bodyPreview: string;
  hasAttachments: boolean;
  parentFolderId: string;
  from?: { emailAddress?: { address?: string } };
}

/**
 * Subscription-Validation: Microsoft sendet validationToken als Query-Param,
 * wir spiegeln ihn als text/plain. Funktioniert sowohl auf POST als auch GET.
 */
function maybeHandleValidation(request: NextRequest): NextResponse | null {
  const validationToken = request.nextUrl.searchParams.get("validationToken");
  if (!validationToken) return null;
  logInfo("graph-notification", "Subscription-Validation handshake", {
    token_len: validationToken.length,
  });
  return new NextResponse(validationToken, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function GET(request: NextRequest) {
  const validation = maybeHandleValidation(request);
  if (validation) return validation;
  return NextResponse.json({ error: "expected validationToken or POST" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const validation = maybeHandleValidation(request);
  if (validation) return validation;

  return withRequestId(async () => {
    let body: NotificationPayload;
    try {
      body = (await request.json()) as NotificationPayload;
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    if (!body || !Array.isArray(body.value) || body.value.length === 0) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    const supabase = createServiceClient();
    let processed = 0;
    let skipped = 0;

    for (const note of body.value) {
      try {
        if (!note.subscriptionId || !note.clientState) {
          skipped++;
          continue;
        }

        // 1. clientState verifizieren gegen mail_sync_subscriptions
        const { data: sub } = await supabase
          .from("mail_sync_subscriptions")
          .select("id, folder_id, client_state, mail_sync_folders(folder_path, document_hint)")
          .eq("graph_subscription_id", note.subscriptionId)
          .maybeSingle();

        if (!sub) {
          logError("graph-notification", "Unbekannte subscriptionId", {
            subscriptionId: note.subscriptionId,
          });
          skipped++;
          continue;
        }

        if (sub.client_state !== note.clientState) {
          logError("graph-notification", "clientState mismatch — Replay-Attack-Verdacht", {
            subscriptionId: note.subscriptionId,
          });
          skipped++;
          continue;
        }

        // 2. Message-ID extrahieren
        const graphMessageId = note.resourceData?.id;
        if (!graphMessageId) {
          skipped++;
          continue;
        }

        // 3. Volle Message-Metadaten holen (für Claim + Folder-Verifikation)
        const mailbox = process.env.MS_MAILBOX ?? "";
        let message: OutlookMessage;
        try {
          message = await graphFetch<OutlookMessage>(
            `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(graphMessageId)}?$select=id,internetMessageId,receivedDateTime,subject,bodyPreview,hasAttachments,parentFolderId,from`,
            { headers: { Prefer: 'outlook.body-content-type="text"' } },
          );
        } catch (err) {
          // 404 = Mail wurde sofort gelöscht oder ist in anderem Folder
          logInfo("graph-notification", "Graph-Fetch fehlgeschlagen", {
            graph_message_id: graphMessageId,
            error: err instanceof Error ? err.message : String(err),
          });
          skipped++;
          continue;
        }

        // 4. Idempotency-Claim — wenn schon verarbeitet, skip
        const folderHint = (sub as unknown as { mail_sync_folders?: { document_hint?: string | null } })
          .mail_sync_folders?.document_hint ?? null;

        const claimed = await claimMessage(supabase, {
          internet_message_id: message.internetMessageId,
          graph_message_id: message.id,
          folder_id: sub.folder_id,
          folder_hint: folderHint,
          received_at: message.receivedDateTime,
          sender: message.from?.emailAddress?.address ?? null,
          subject: message.subject ?? null,
          has_attachments: !!message.hasAttachments,
        });

        if (!claimed) {
          // Duplicate — already processed
          skipped++;
          continue;
        }

        // 5. Fan-out an process-one (analog pg_cron fan_out_pending_mails)
        // Wir machen einen direkten HTTP-POST hier weil wir bereits in einem
        // Lambda sind und die Notification schnell quittieren wollen.
        const processOneUrl = `${getInternalBase()}/api/cron/process-one`;
        try {
          await fetch(processOneUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
            },
            body: JSON.stringify({ internet_message_id: message.internetMessageId }),
          });
          processed++;
          logInfo("graph-notification", "Mail-Notification processed", {
            internet_message_id: message.internetMessageId,
            subject: message.subject?.slice(0, 80),
            folder_id: sub.folder_id,
          });
        } catch (fanoutErr) {
          // Fan-out failed → Mail bleibt 'pending', wird vom retry-Cron geholt
          logError("graph-notification", "Fan-out fehlgeschlagen", fanoutErr);
        }
      } catch (err) {
        logError("graph-notification", "Notification-Verarbeitungs-Fehler", err);
        skipped++;
      }
    }

    return NextResponse.json({ ok: true, processed, skipped });
  });
}

function getInternalBase(): string {
  const explicit = process.env.INTERNAL_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  return "https://cloud.mrumbau.de";
}
