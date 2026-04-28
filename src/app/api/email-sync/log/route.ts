/**
 * GET /api/email-sync/log
 *
 * Paginierte Liste der verarbeiteten Mails.
 * Query-Params:
 *   ?folder_id=...      → nur Mails dieses Folders
 *   ?status=processed|irrelevant|failed|pending
 *   ?mismatch=true      → nur Mails mit Folder-Mismatch
 *   ?limit=50&offset=0
 *
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil, requireRoles } from "@/lib/auth";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const profil = await getBenutzerProfil();
  if (!requireRoles(profil, "admin")) {
    return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const folderId = sp.get("folder_id");
  const status = sp.get("status");
  const mismatch = sp.get("mismatch") === "true";
  const limit = Math.min(parseInt(sp.get("limit") ?? "50", 10) || 50, 200);
  const offset = Math.max(parseInt(sp.get("offset") ?? "0", 10) || 0, 0);

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("email_processing_log")
    .select(
      "internet_message_id, graph_message_id, folder_id, folder_hint, ki_classified_as, ki_confidence, folder_mismatch, status, received_at, processed_at, openai_input_tokens, openai_output_tokens, openai_cost_eur, error_msg, bestellung_id, sender, subject, has_attachments, created_at, mail_sync_folders!inner(folder_name, folder_path)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (folderId) query = query.eq("folder_id", folderId);
  if (status) query = query.eq("status", status);
  if (mismatch) query = query.eq("folder_mismatch", true);

  const { data, count, error } = await query;
  if (error) {
    logError("email-sync/log/GET", "DB-Fehler", error);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }

  return NextResponse.json({
    entries: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
}
