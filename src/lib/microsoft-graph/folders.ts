/**
 * Outlook-Folder-Listing via Microsoft Graph.
 *
 * Wird vom Admin-UI ("Folder hinzufügen"-Modal) und vom Cron-Bootstrap genutzt,
 * um die graph_folder_id zu finden, die in mail_sync_folders gespeichert wird.
 *
 * Liefert eine flache Liste mit display-Pfad ("Posteingang/In Sachen Rechnungen"),
 * sortiert breadth-first.
 */

import { graphFetch } from "./client";

export interface MailFolder {
  id: string;
  displayName: string;
  /** Pfad ab Wurzel, z.B. "Posteingang/Lieferscheine". */
  path: string;
  parentFolderId: string | null;
  childFolderCount: number;
  totalItemCount: number;
  unreadItemCount: number;
}

interface GraphMailFolder {
  id: string;
  displayName: string;
  parentFolderId: string;
  childFolderCount: number;
  totalItemCount: number;
  unreadItemCount: number;
}

interface GraphPaged<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

function getMailbox(): string {
  const m = process.env.MS_MAILBOX;
  if (!m) throw new Error("MS_MAILBOX nicht gesetzt");
  return m;
}

async function fetchAllPages<T>(initialEndpoint: string): Promise<T[]> {
  const items: T[] = [];
  let next: string | undefined;
  let endpoint: string | undefined = initialEndpoint;

  while (endpoint || next) {
    const result = next
      ? await graphFetch<GraphPaged<T>>("", { absoluteUrl: next })
      : await graphFetch<GraphPaged<T>>(endpoint!);
    items.push(...result.value);
    next = result["@odata.nextLink"];
    endpoint = undefined;
    if (!next) break;
  }

  return items;
}

/**
 * Liefert ALLE Mail-Folder rekursiv (incl. Subfolder) mit konstruiertem Pfad.
 * Reihenfolge: Top-Level zuerst, dann Subfolder breadth-first.
 */
export async function listAllFolders(): Promise<MailFolder[]> {
  const mailbox = encodeURIComponent(getMailbox());

  // Top-Level: /mailFolders. Standardmäßig nur sichtbare Folder (ohne System-Hidden).
  const topLevel = await fetchAllPages<GraphMailFolder>(
    `/users/${mailbox}/mailFolders?$top=100`,
  );

  const result: MailFolder[] = [];
  const queue: { folder: GraphMailFolder; pathPrefix: string }[] = topLevel.map((f) => ({
    folder: f,
    pathPrefix: "",
  }));

  while (queue.length > 0) {
    const { folder, pathPrefix } = queue.shift()!;
    const path = pathPrefix ? `${pathPrefix}/${folder.displayName}` : folder.displayName;
    result.push({
      id: folder.id,
      displayName: folder.displayName,
      path,
      parentFolderId: folder.parentFolderId ?? null,
      childFolderCount: folder.childFolderCount,
      totalItemCount: folder.totalItemCount,
      unreadItemCount: folder.unreadItemCount,
    });

    if (folder.childFolderCount > 0) {
      const children = await fetchAllPages<GraphMailFolder>(
        `/users/${mailbox}/mailFolders/${folder.id}/childFolders?$top=100`,
      );
      for (const child of children) {
        queue.push({ folder: child, pathPrefix: path });
      }
    }
  }

  return result;
}

/**
 * Holt einen einzelnen Folder per ID (für Refresh nach Outlook-Rename etc.).
 * Pfad wird NICHT auto-konstruiert (würde extra Roundtrips kosten) — falls
 * benötigt, verwendet listAllFolders() und filtert.
 */
export async function getFolderById(folderId: string): Promise<Omit<MailFolder, "path"> | null> {
  const mailbox = encodeURIComponent(getMailbox());
  try {
    const folder = await graphFetch<GraphMailFolder>(
      `/users/${mailbox}/mailFolders/${encodeURIComponent(folderId)}`,
    );
    return {
      id: folder.id,
      displayName: folder.displayName,
      parentFolderId: folder.parentFolderId ?? null,
      childFolderCount: folder.childFolderCount,
      totalItemCount: folder.totalItemCount,
      unreadItemCount: folder.unreadItemCount,
    };
  } catch (err) {
    // Bei 404 → Folder gelöscht/umbenannt. Caller entscheidet wie damit umzugehen.
    if (err instanceof Error && err.message.includes("404")) {
      return null;
    }
    throw err;
  }
}
