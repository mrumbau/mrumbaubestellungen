/**
 * GET /api/email-sync/graph-folders
 *
 * Listet alle Outlook-Folder von info@mrumbau.de via Microsoft Graph.
 * Wird vom "Folder hinzufügen"-Modal verwendet, um die graph_folder_id
 * zu finden, die danach in mail_sync_folders gespeichert wird.
 *
 * Admin-only. Cached pro Request — Graph-Folder ändern sich selten.
 */

import { NextResponse } from "next/server";
import { getBenutzerProfil, requireRoles } from "@/lib/auth";
import { listAllFolders } from "@/lib/microsoft-graph/folders";
import { ERRORS } from "@/lib/errors";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const profil = await getBenutzerProfil();
  if (!requireRoles(profil, "admin")) {
    return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
  }

  try {
    const folders = await listAllFolders();
    return NextResponse.json({ folders });
  } catch (err) {
    logError("email-sync/graph-folders", "Graph-Fehler", err);
    return NextResponse.json(
      {
        error: "Microsoft Graph Anfrage fehlgeschlagen",
        details: err instanceof Error ? err.message : null,
      },
      { status: 502 },
    );
  }
}
