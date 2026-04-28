/**
 * GET    /api/email-sync/folders          → Liste aller konfigurierten Folder
 * POST   /api/email-sync/folders          → Neuen Folder hinzufügen
 *
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil, requireRoles } from "@/lib/auth";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

const VALID_HINTS = ["rechnung", "lieferschein", "bestellbestaetigung", "versand"] as const;

export async function GET() {
  const profil = await getBenutzerProfil();
  if (!requireRoles(profil, "admin")) {
    return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("mail_sync_folders")
    .select("*")
    .order("folder_path", { ascending: true });

  if (error) {
    logError("email-sync/folders/GET", "DB-Fehler", error);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
  return NextResponse.json({ folders: data ?? [] });
}

export async function POST(request: NextRequest) {
  const profil = await getBenutzerProfil();
  if (!requireRoles(profil, "admin")) {
    return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: ERRORS.UNGUELTIGE_AKTION }, { status: 400 });
  }

  const { graph_folder_id, folder_name, folder_path, document_hint } = body as {
    graph_folder_id?: string;
    folder_name?: string;
    folder_path?: string;
    document_hint?: string | null;
  };

  if (!graph_folder_id || !folder_name || !folder_path) {
    return NextResponse.json(
      { error: "graph_folder_id, folder_name und folder_path sind Pflicht" },
      { status: 400 },
    );
  }

  if (document_hint && !VALID_HINTS.includes(document_hint as (typeof VALID_HINTS)[number])) {
    return NextResponse.json(
      { error: `document_hint muss einer von: ${VALID_HINTS.join(", ")} sein, oder null` },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("mail_sync_folders")
    .insert({
      graph_folder_id,
      folder_name,
      folder_path,
      document_hint: document_hint || null,
      enabled: true,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Folder ist bereits konfiguriert" },
        { status: 409 },
      );
    }
    logError("email-sync/folders/POST", "Insert-Fehler", error);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
  return NextResponse.json({ folder: data });
}
