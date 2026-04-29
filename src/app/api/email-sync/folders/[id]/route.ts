/**
 * PATCH  /api/email-sync/folders/:id     → enabled-Toggle, document_hint ändern
 * DELETE /api/email-sync/folders/:id     → Folder + Log-Einträge löschen (CASCADE)
 *
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getBenutzerProfil, requireRoles } from "@/lib/auth";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

const VALID_HINTS = ["rechnung", "lieferschein", "bestellbestaetigung", "versand"] as const;

// F3.E12 Fix: Zod-Schema mit strict-Mode — verbietet unbekannte Felder.
// Verhindert dass z.B. ein Bug der `delta_token` direkt erlaubt durchschlüpft.
const PatchSchema = z.object({
  enabled: z.boolean().optional(),
  document_hint: z.union([z.enum(VALID_HINTS), z.null()]).optional(),
  reset_delta_token: z.boolean().optional(),
}).strict();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const profil = await getBenutzerProfil();
  if (!requireRoles(profil, "admin")) {
    return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
  }

  const { id } = await context.params;
  const rawBody = await request.json().catch(() => null);
  if (!rawBody || typeof rawBody !== "object") {
    return NextResponse.json({ error: ERRORS.UNGUELTIGE_AKTION }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({
      error: "Body invalid (whitelist: enabled, document_hint, reset_delta_token)",
      issues: parsed.error.issues,
    }, { status: 400 });
  }
  const body = parsed.data;

  const update: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") update.enabled = body.enabled;
  if (body.document_hint !== undefined) update.document_hint = body.document_hint;
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
