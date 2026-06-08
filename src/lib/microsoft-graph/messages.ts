/**
 * Microsoft Graph: nicht-delta Mail-Listing für Backfill.
 *
 * Im Gegensatz zu deltaSync() liest dieser Helper Mails direkt per
 * /messages?$filter=receivedDateTime ge X, ohne Delta-Token. Damit kann
 * der Admin-Backfill verpasste Mails finden, ohne den laufenden Delta-
 * State des Folders zu stören.
 *
 * Mechanik:
 *   - Endpoint: /users/{mailbox}/mailFolders/{folderId}/messages
 *   - Filter: receivedDateTime ge YYYY-MM-DDTHH:MM:SSZ
 *   - $top=50 pro Page, $orderby für stabile Reihenfolge
 *   - Pagination via @odata.nextLink
 *
 * Wir machen KEIN Delta-Aufruf, damit der laufende Token nicht durch
 * Backfill-Reads beeinflusst wird (Microsoft tracked Read-State in Delta).
 *
 * Hartes Limit gegen Runaway: maxPages parameter (default 50 = 2500 Mails).
 */

import { graphFetch } from "./client";
import { getMailboxSegment } from "./client";
import type { MailMessage } from "./delta";

interface MessagesPage {
  value: MailMessage[];
  "@odata.nextLink"?: string;
}

export interface ListMessagesSinceOpts {
  folderId: string;
  /** ISO-Datum (UTC), nur Mails ab dann werden zurückgegeben. */
  sinceIso: string;
  /** Max Pages bevor Loop abbricht. Default 50 = 2500 Mails. */
  maxPages?: number;
}

/**
 * AsyncGenerator: yieldet pro Page ein Mail-Array.
 *
 * Verwendung:
 *   for await (const batch of listMessagesSince({...})) {
 *     for (const msg of batch) { ... }
 *   }
 */
export async function* listMessagesSince(
  opts: ListMessagesSinceOpts,
): AsyncGenerator<MailMessage[], void, void> {
  const { folderId, sinceIso, maxPages = 50 } = opts;
  const mailbox = getMailboxSegment();
  const select =
    "id,internetMessageId,receivedDateTime,subject,bodyPreview,body,from,hasAttachments,parentFolderId";

  // $filter mit single-quote-escapten ISO-Wert. Microsoft Graph erwartet
  // receivedDateTime im Format YYYY-MM-DDTHH:MM:SSZ.
  const filter = `receivedDateTime ge ${sinceIso}`;
  const initialEndpoint =
    `/users/${mailbox}/mailFolders/${encodeURIComponent(folderId)}/messages` +
    `?$select=${select}` +
    `&$filter=${encodeURIComponent(filter)}` +
    `&$orderby=receivedDateTime%20desc` +
    `&$top=50`;

  let nextUrl: string | undefined = initialEndpoint;
  let pagesRead = 0;

  while (nextUrl && pagesRead < maxPages) {
    const currentUrl: string = nextUrl;
    const page: MessagesPage = await graphFetch<MessagesPage>("", {
      absoluteUrl: currentUrl.startsWith("http")
        ? currentUrl
        : `https://graph.microsoft.com/v1.0${currentUrl}`,
      headers: { Prefer: 'outlook.body-content-type="text"' },
    });
    pagesRead++;

    if (page.value.length > 0) {
      yield page.value;
    }

    nextUrl = page["@odata.nextLink"];
  }
}
