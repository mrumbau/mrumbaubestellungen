/**
 * POST /api/email-sync/log/:id/replay
 *
 * "Replay": Eine bereits verarbeitete Mail erneut durch die Pipeline jagen.
 * Use Cases:
 * - Manuell nach Bug-Fix in classify/ingest
 * - Test der Pipeline mit echten Daten
 *
 * Mechanik:
 * 1. graph_message_id aus dem Log laden
 * 2. Mail neu von Microsoft Graph holen (möglicherweise wurde sie gelöscht/verschoben)
 * 3. classify + ingest erneut aufrufen
 * 4. Log-Eintrag mit neuen Werten überschreiben (status, processed_at, ki_*)
 *
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil, requireRoles } from "@/lib/auth";
import { graphFetch, GraphError } from "@/lib/microsoft-graph/client";
import { fetchAllFileAttachments } from "@/lib/microsoft-graph/attachments";
import { classifyEmail } from "@/lib/email-pipeline/classify";
import { ingestEmail } from "@/lib/email-pipeline/ingest";
import {
  markIrrelevant,
  markProcessed,
  markFailed,
} from "@/lib/email-sync/idempotency";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface FullMessage {
  id: string;
  internetMessageId: string;
  receivedDateTime: string;
  subject: string;
  bodyPreview: string;
  body: { contentType: string; content: string };
  from: { emailAddress: { name?: string; address: string } } | null;
  hasAttachments: boolean;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const profil = await getBenutzerProfil();
  if (!requireRoles(profil, "admin")) {
    return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
  }

  const { id: internetMessageId } = await context.params;

  // Wir brauchen Service-Client für RLS-Bypass beim Updaten von log + folder
  const sb = createServiceClient();
  const sbRead = await createServerSupabaseClient();

  const { data: logEntry, error: logErr } = await sbRead
    .from("email_processing_log")
    .select("internet_message_id, graph_message_id, folder_id, mail_sync_folders!inner(document_hint)")
    .eq("internet_message_id", internetMessageId)
    .single();

  if (logErr || !logEntry) {
    return NextResponse.json({ error: ERRORS.NICHT_GEFUNDEN }, { status: 404 });
  }

  const folderHint =
    (logEntry as unknown as { mail_sync_folders?: { document_hint?: string | null } })
      .mail_sync_folders?.document_hint ?? null;
  const graphMessageId = logEntry.graph_message_id;

  const mailbox = encodeURIComponent(process.env.MS_MAILBOX ?? "");
  if (!mailbox) {
    return NextResponse.json({ error: "MS_MAILBOX nicht gesetzt" }, { status: 500 });
  }

  let message: FullMessage;
  try {
    message = await graphFetch<FullMessage>(
      `/users/${mailbox}/messages/${encodeURIComponent(graphMessageId)}?$select=id,internetMessageId,receivedDateTime,subject,bodyPreview,body,from,hasAttachments`,
      { headers: { Prefer: 'outlook.body-content-type="text"' } },
    );
  } catch (err) {
    if (err instanceof GraphError && err.status === 404) {
      return NextResponse.json(
        { error: "Mail wurde in Outlook gelöscht oder verschoben — Replay nicht möglich" },
        { status: 410 },
      );
    }
    logError("email-sync/replay", "Graph-Fehler", err);
    return NextResponse.json({ error: "Graph-Fehler beim Replay" }, { status: 502 });
  }

  try {
    const classifyResult = await classifyEmail({
      email_absender: message.from?.emailAddress.address ?? "",
      email_betreff: message.subject ?? "",
      email_vorschau: message.bodyPreview ?? "",
      hat_anhaenge: message.hasAttachments,
    });

    if (!classifyResult.relevant) {
      await markIrrelevant(sb, internetMessageId, classifyResult.grund);
      return NextResponse.json({
        success: true,
        outcome: "irrelevant",
        grund: classifyResult.grund,
      });
    }

    const attachments = message.hasAttachments
      ? await fetchAllFileAttachments(message.id)
      : [];

    const ingestResult = await ingestEmail({
      email_absender: message.from?.emailAddress.address ?? "",
      email_betreff: message.subject ?? "",
      email_datum: message.receivedDateTime,
      email_text: message.body?.content ?? "",
      email_vorschau: message.bodyPreview ?? "",
      vorfilter: "ja",
      haendler_id: classifyResult.haendler_id,
      haendler_name: classifyResult.haendler_name,
      su_id: classifyResult.su_id,
      bestellnummer_betreff: classifyResult.bestellnummer_betreff,
      anhaenge: attachments,
      document_hint: folderHint,
    });

    if (!ingestResult.success) {
      await markFailed(sb, internetMessageId, ingestResult.fehler ?? "ingest_fehlgeschlagen");
      return NextResponse.json({
        success: false,
        outcome: "failed",
        fehler: ingestResult.fehler,
      });
    }

    await markProcessed(sb, internetMessageId, {
      bestellung_id: ingestResult.bestellung_id,
      ki_classified_as: ingestResult.dokument_typ,
      ki_confidence: ingestResult.ki_confidence,
      parser_source: ingestResult.parser_source,
      parser_name: ingestResult.parser_name,
    });

    return NextResponse.json({
      success: true,
      outcome: "processed",
      bestellung_id: ingestResult.bestellung_id,
    });
  } catch (err) {
    logError("email-sync/replay", "Replay-Pipeline-Fehler", err);
    const msg = err instanceof Error ? err.message : "unbekannter_fehler";
    await markFailed(sb, internetMessageId, msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
