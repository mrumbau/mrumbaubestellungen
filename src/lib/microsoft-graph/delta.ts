/**
 * Microsoft Graph Delta-Query für Mail-Messages pro Folder.
 *
 * Mechanik:
 * - Erster Call ohne deltaToken → liefert ALLE aktuellen Messages im Folder
 *   + finalen deltaLink. Bei großen Folders viele Seiten.
 * - Jeder weitere Call mit gespeichertem deltaLink → nur Änderungen seit
 *   dem letzten Sync (neu, geändert, gelöscht).
 * - 410 Gone → deltaToken ist abgelaufen (>30 Tage). Caller setzt
 *   delta_token=NULL und macht Bootstrap neu.
 *
 * Wir speichern den vollständigen deltaLink-URL als `delta_token` in DB.
 * Graph-URLs sind opak und stabil — kein eigenes URL-Parsing.
 *
 * Caller pattern (AsyncGenerator):
 *   const gen = deltaSync({ folderId, deltaToken });
 *   let result;
 *   while (!(result = await gen.next()).done) {
 *     await processBatch(result.value); // Mail[]
 *   }
 *   const finalDeltaLink = result.value; // string
 *   // → in mail_sync_folders.delta_token speichern
 */

import { graphFetch, GraphError } from "./client";

export interface MailMessage {
  /** Graph-interne ID, ändert sich bei Move zwischen Folders. */
  id: string;
  /** RFC822 Internet-Message-ID, stabil über Folder-Moves. PK in unserer DB. */
  internetMessageId: string;
  receivedDateTime: string;
  subject: string;
  bodyPreview: string;
  // F3.A5 Fix: Microsoft Graph kann auch andere ContentTypes liefern (z.B.
  // multipart). Prefer-Header zwingt zwar Text, aber bei Ignorieren wäre
  // strict union zu eng — string ist defensiver.
  body: { contentType: string; content: string };
  from: { emailAddress: { name?: string; address: string } } | null;
  hasAttachments: boolean;
  parentFolderId: string;
  /** Bei deleted-Notifications setzt Graph diesen Marker. */
  removed?: { reason: string };
}

interface DeltaPage {
  value: MailMessage[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

/** Delta-Token-Lifecycle abgelaufen → Bootstrap nötig. */
export class DeltaTokenExpiredError extends Error {
  constructor() {
    super("Delta-Token abgelaufen, Bootstrap erforderlich");
    this.name = "DeltaTokenExpiredError";
  }
}

function getMailbox(): string {
  const m = process.env.MS_MAILBOX;
  if (!m) throw new Error("MS_MAILBOX nicht gesetzt");
  return m;
}

/**
 * AsyncGenerator: yieldet pro Page ein Mail-Array, returned final deltaLink.
 *
 * @param folderId   graph_folder_id
 * @param deltaToken full deltaLink URL aus letztem Sync (oder null = Bootstrap)
 */
export async function* deltaSync(opts: {
  folderId: string;
  deltaToken: string | null;
}): AsyncGenerator<MailMessage[], string, void> {
  const { folderId, deltaToken } = opts;
  const mailbox = encodeURIComponent(getMailbox());

  // Felder die wir wirklich brauchen — spart Bandbreite + Datenschutz.
  const select =
    "id,internetMessageId,receivedDateTime,subject,bodyPreview,body,from,hasAttachments,parentFolderId";

  let nextUrl: string | undefined;
  let initialEndpoint: string | undefined;

  if (deltaToken) {
    // Wiederaufnehmen mit gespeichertem deltaLink
    nextUrl = deltaToken;
  } else {
    // Bootstrap
    initialEndpoint = `/users/${mailbox}/mailFolders/${encodeURIComponent(folderId)}/messages/delta?$select=${select}&$top=50`;
  }

  let finalDeltaLink: string | null = null;

  while (initialEndpoint || nextUrl) {
    let page: DeltaPage;
    try {
      if (initialEndpoint) {
        page = await graphFetch<DeltaPage>(initialEndpoint, {
          headers: { Prefer: 'outlook.body-content-type="text"' },
        });
        initialEndpoint = undefined;
      } else {
        page = await graphFetch<DeltaPage>("", {
          absoluteUrl: nextUrl!,
          headers: { Prefer: 'outlook.body-content-type="text"' },
        });
      }
    } catch (err) {
      if (
        err instanceof GraphError &&
        (err.status === 410 || err.graphCode === "syncStateInvalid" || err.graphCode === "syncStateNotFound")
      ) {
        throw new DeltaTokenExpiredError();
      }
      throw err;
    }

    if (page.value.length > 0) {
      yield page.value;
    }

    if (page["@odata.nextLink"]) {
      nextUrl = page["@odata.nextLink"];
      continue;
    }
    if (page["@odata.deltaLink"]) {
      finalDeltaLink = page["@odata.deltaLink"];
      break;
    }
    // Keine Links → wir sind fertig, sollte aber bei Delta nicht passieren
    break;
  }

  if (!finalDeltaLink) {
    throw new Error("Delta-Sync ohne deltaLink beendet — Graph-API-Verhalten unerwartet");
  }
  return finalDeltaLink;
}
