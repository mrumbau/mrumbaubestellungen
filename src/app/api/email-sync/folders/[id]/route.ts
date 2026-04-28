/**
 * PATCH  /api/email-sync/folders/:id     → enabled-Toggle, document_hint ändern
 * DELETE /api/email-sync/folders/:id     → Folder + Log-Einträge löschen (CASCADE)
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

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const profil = await getBenutzerProfil();
  if (!requireRoles(profil, "admin")) {
    return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: ERRORS.UNGUELTIGE_AKTION }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") update.enabled = body.enabled;
  if (body.document_hint !== undefined) {
    if (
      body.document_hint !== null &&
      !VALID_HINTS.includes(body.document_hint as (typeof VALID_HINTS)[number])
    ) {
      return NextResponse.json(
        { error: `document_hint muss einer von: ${VALID_HINTS.join(", ")} sein, oder null` },
        { status: 400 },
      );
    }
    update.document_hint = body.document_hint;
  }
  // Reset des delta_token erlaubt — erzwingt Bootstrap beim nächsten Sync
  if (body.reset_delta_token === true) {
    update.delta_token = null;
    update.last_error = null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Keine validen Felder zum Update" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("mail_sync_folders")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    logError("email-sync/folders/PATCH", "Update-Fehler", error);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
  return NextResponse.json({ folder: data });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const profil = await getBenutzerProfil();
  if (!requireRoles(profil, "admin")) {
    return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
  }

  const { id } = await context.params;
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("mail_sync_folders").delete().eq("id", id);

  if (error) {
    logError("email-sync/folders/DELETE", "Delete-Fehler", error);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
