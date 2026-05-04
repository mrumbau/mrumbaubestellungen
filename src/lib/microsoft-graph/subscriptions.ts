/**
 * Microsoft Graph Subscriptions — Push-Notifications für Mail-Eingang.
 *
 * Architektur:
 * - Pro `mail_sync_folders`-Eintrag eine Subscription auf
 *   `/users/{mailbox}/mailFolders/{folderId}/messages?$filter=isDraft eq false`
 * - notificationUrl: https://cloud.mrumbau.de/api/webhook/graph-notification
 *   (Vercel-Custom-Domain — nicht von Deployment-Protection geschützt)
 * - clientState: Random-Token, validiert eingehende Notifications
 * - expirationDateTime: max ~70h für /messages, wir setzen 60h Buffer
 *
 * Renewal-Strategie:
 * - cron `graph-renew` (alle 12h): PATCH /subscriptions/{id} mit neuem expirationDateTime
 *   wenn <24h Restzeit
 * - cron `graph-rescue` (alle 6h): bei 2× consecutive_failures ODER expired:
 *   neue Subscription anlegen
 */

import { graphFetch, GraphError, getMailboxSegment } from "./client";
import { logError, logInfo } from "@/lib/logger";
import { randomBytes } from "node:crypto";

const ROUTE_TAG = "microsoft-graph/subscriptions";

/**
 * Maximum-Lifetime für mail-message-Subscriptions: 4230 min (~70.5h).
 * Wir setzen 60h damit pg_cron-Renewal (alle 12h) immer rechtzeitig kommt.
 */
const SUBSCRIPTION_LIFETIME_HOURS = 60;

export interface GraphSubscription {
  id: string;
  resource: string;
  notificationUrl: string;
  expirationDateTime: string;
  clientState: string;
  changeType: string;
}

function generateClientState(): string {
  // 32-byte random hex token — pro Subscription unique, dient als HMAC-Stand-in
  return randomBytes(32).toString("hex");
}

function newExpirationDate(hours = SUBSCRIPTION_LIFETIME_HOURS): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

/**
 * Erstellt eine neue Push-Subscription bei Microsoft Graph.
 * notificationUrl muss publicly accessible (HTTPS) sein. Microsoft sendet
 * eine GET mit `?validationToken=xxx` an die URL — Webhook-Handler muss
 * den Token unverändert als text/plain zurückgeben.
 */
export async function createSubscription(input: {
  folderId: string;
  notificationUrl: string;
  clientState?: string;
}): Promise<GraphSubscription> {
  const mailbox = getMailboxSegment();
  const resource = `users/${mailbox}/mailFolders/${input.folderId}/messages`;
  const clientState = input.clientState ?? generateClientState();

  // graphFetch ruft selbst JSON.stringify() auf body — wir übergeben das Object
  // direkt (vorher hier nochmal gestringify-t → Microsoft empfing
  // doppelt-encoded-JSON → "Empty Payload. JSON content expected").
  const sub = await graphFetch<GraphSubscription>("/subscriptions", {
    method: "POST",
    body: {
      changeType: "created",
      notificationUrl: input.notificationUrl,
      resource,
      expirationDateTime: newExpirationDate(),
      clientState,
    },
  });

  logInfo(ROUTE_TAG, "Subscription created", {
    id: sub.id,
    resource,
    expires: sub.expirationDateTime,
  });

  // Microsoft echo't den clientState NICHT zurück (Security-Feature) — wir
  // behalten den lokal generierten/passed Wert.
  return { ...sub, clientState };
}

/**
 * Verlängert eine bestehende Subscription. Bei 404: Subscription wurde
 * von Microsoft gedropt → Caller muss neu anlegen via createSubscription.
 */
export async function renewSubscription(graphSubscriptionId: string): Promise<GraphSubscription> {
  const sub = await graphFetch<GraphSubscription>(
    `/subscriptions/${graphSubscriptionId}`,
    {
      method: "PATCH",
      body: { expirationDateTime: newExpirationDate() },
    },
  );
  logInfo(ROUTE_TAG, "Subscription renewed", { id: sub.id, expires: sub.expirationDateTime });
  return sub;
}

/** Löscht eine Subscription. Idempotent — 404 wird verschluckt. */
export async function deleteSubscription(graphSubscriptionId: string): Promise<void> {
  try {
    await graphFetch(`/subscriptions/${graphSubscriptionId}`, { method: "DELETE", responseType: "raw" });
    logInfo(ROUTE_TAG, "Subscription deleted", { id: graphSubscriptionId });
  } catch (err) {
    if (err instanceof GraphError && err.status === 404) {
      logInfo(ROUTE_TAG, "Subscription bereits gelöscht (404)", { id: graphSubscriptionId });
      return;
    }
    logError(ROUTE_TAG, "Subscription-Delete-Fehler", err);
    throw err;
  }
}

/** Listet alle aktiven Subscriptions (Diagnose). */
export async function listSubscriptions(): Promise<{ value: GraphSubscription[] }> {
  return graphFetch<{ value: GraphSubscription[] }>("/subscriptions");
}
