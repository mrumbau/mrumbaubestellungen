/**
 * Microsoft Graph Mail-Attachment-Listing und -Download.
 *
 * Drei Attachment-Typen in Outlook:
 * - fileAttachment   → echte Dateien (PDFs, Bilder). contentBytes inline (base64).
 * - itemAttachment   → ganze Outlook-Items (z.B. weitergeleitete Mail). Skippen.
 * - referenceAttachment → OneDrive/SharePoint-Link. Skippen, kein Anhang.
 *
 * Strategie:
 * - listAttachments: Metadaten aller Attachments (Größe, Name, Typ).
 * - getAttachmentBytes: lädt für ein einzelnes Attachment die contentBytes.
 *   Bei >4 MB: separater /$value-Call der den Stream als Binary liefert,
 *   den wir dann zu base64 wandeln.
 *
 * Returnformat ist kompatibel zum heutigen Make.com-Format
 * (`{ name, contentType, contentBytes }`), damit ingest.ts unverändert bleibt.
 */

import { graphFetch, GraphError } from "./client";

export interface AttachmentMeta {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
  attachmentType: "fileAttachment" | "itemAttachment" | "referenceAttachment";
}

export interface AttachmentWithBytes {
  name: string;
  contentType: string;
  /** Base64-kodierter Inhalt — gleiches Format wie Make.com es lieferte. */
  contentBytes: string;
}

/** Schwellwert ab dem statt inline der /$value-Stream verwendet wird. */
const INLINE_BYTES_LIMIT = 4 * 1024 * 1024;

interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
  "@odata.type": string;
  contentBytes?: string;
}

interface GraphAttachmentList {
  value: GraphAttachment[];
}

function getMailbox(): string {
  const m = process.env.MS_MAILBOX;
  if (!m) throw new Error("MS_MAILBOX nicht gesetzt");
  return m;
}

function mapAttachmentType(odataType: string): AttachmentMeta["attachmentType"] {
  if (odataType.includes("fileAttachment")) return "fileAttachment";
  if (odataType.includes("itemAttachment")) return "itemAttachment";
  return "referenceAttachment";
}

/**
 * Listet Attachment-Metadaten OHNE contentBytes (ist beim List-Call leer für >0 Größe).
 * Limit 25 — bei mehr nehmen wir die ersten 25 (Make hatte limit=10).
 */
export async function listAttachments(messageId: string): Promise<AttachmentMeta[]> {
  const mailbox = encodeURIComponent(getMailbox());
  const result = await graphFetch<GraphAttachmentList>(
    `/users/${mailbox}/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size,isInline&$top=25`,
  );
  return result.value.map((a) => ({
    id: a.id,
    name: a.name ?? "anhang",
    contentType: a.contentType ?? "application/octet-stream",
    size: a.size ?? 0,
    isInline: a.isInline ?? false,
    attachmentType: mapAttachmentType(a["@odata.type"] ?? ""),
  }));
}

/**
 * Lädt einen Anhang als base64. Routet je nach Größe:
 * - <= 4MB: vollständiger /$value-Aufruf gibt Bytes als ArrayBuffer
 * - > 4MB: gleicher Endpoint, gleiches Verhalten, aber wir loggen Größe.
 *
 * Itemattachments und Referenceattachments werden NICHT unterstützt — Caller
 * muss sie vorher rausfiltern.
 */
export async function getAttachmentBytes(
  messageId: string,
  attachment: AttachmentMeta,
): Promise<AttachmentWithBytes> {
  if (attachment.attachmentType !== "fileAttachment") {
    throw new Error(
      `Anhang-Typ ${attachment.attachmentType} nicht unterstützt für ${attachment.name}`,
    );
  }

  const mailbox = encodeURIComponent(getMailbox());

  // Für kleine Anhänge: ein einziger Call mit contentBytes.
  // Bei großen: gleicher Endpoint funktioniert auch, Graph streamt es ohne Truncation.
  if (attachment.size <= INLINE_BYTES_LIMIT) {
    const full = await graphFetch<GraphAttachment>(
      `/users/${mailbox}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachment.id)}`,
    );
    if (!full.contentBytes) {
      throw new GraphError(`Attachment ohne contentBytes: ${attachment.name}`, 200);
    }
    return {
      name: attachment.name,
      contentType: attachment.contentType,
      contentBytes: full.contentBytes,
    };
  }

  // Großer Anhang: /$value liefert Raw-Bytes ohne Wrapping.
  const res = await graphFetch<Response>(
    `/users/${mailbox}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachment.id)}/$value`,
    { responseType: "raw" },
  );
  const buffer = await (res as unknown as Response).arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  return {
    name: attachment.name,
    contentType: attachment.contentType,
    contentBytes: base64,
  };
}

/**
 * Convenience: alle file-Anhänge einer Message als base64-Liste laden.
 * Itemattachments + Referenceattachments werden gefiltert.
 * Fehler bei einzelnen Anhängen werden geschluckt (analog Make-Resume),
 * der Rest wird zurückgegeben.
 */
export async function fetchAllFileAttachments(
  messageId: string,
): Promise<AttachmentWithBytes[]> {
  const all = await listAttachments(messageId);
  const fileOnly = all.filter((a) => a.attachmentType === "fileAttachment" && !a.isInline);

  const result: AttachmentWithBytes[] = [];
  for (const att of fileOnly) {
    try {
      result.push(await getAttachmentBytes(messageId, att));
    } catch {
      // Anhang-Fehler nicht fatal — Mail-Verarbeitung soll fortfahren.
      continue;
    }
  }
  return result;
}
