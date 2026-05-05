import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { logError, logInfo } from "@/lib/logger";
import { safeCompare } from "@/lib/safe-compare";

// POST /api/cron/cleanup-orphan-pdfs
//
// Räumt PDF-Files im Bucket "dokumente" auf, die KEIN korrespondierendes
// dokumente-Record (storage_pfad) haben — typisch entstanden durch
// Re-Backfills (jeder Lauf lädt das PDF mit neuer UUID neu hoch, nur der
// letzte Insert bleibt in der dokumente-Tabelle).
//
// Sicherheitsmechanismen:
//   - min_alter_stunden (default 24): frische Files werden NICHT gelöscht,
//     damit gerade laufende Pipeline-Inserts nicht zerschossen werden.
//     (Race: Storage-Upload kommt vor dokumente-INSERT.)
//   - max_loeschen (default 200): Batch-Limit pro Lauf, verhindert
//     versehentliches Massenlöschen durch falsch konfigurierte Cron-Args.
//   - dry_run (default false): zählt + listet, löscht nichts.
//   - Audit-Log VOR Delete in webhook_logs.
//
// Aufruf-Beispiele:
//   { secret, dry_run: true } → reine Inventur
//   { secret, min_alter_stunden: 168 } → nur Orphans älter 7 Tage
//   { secret, max_loeschen: 50 } → max 50 pro Lauf

const BodySchema = z.object({
  secret: z.string().min(1),
  min_alter_stunden: z.number().int().min(1).max(720).optional(),
  max_loeschen: z.number().int().min(1).max(1000).optional(),
  dry_run: z.boolean().optional(),
}).passthrough();

const BUCKET = "dokumente";
const ROUTE_TAG = "/api/cron/cleanup-orphan-pdfs";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Body invalid", issues: parsed.error.issues }, { status: 400 });
    }
    const body = parsed.data;

    if (!safeCompare(body.secret, process.env.MAKE_WEBHOOK_SECRET)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const minAlterStunden = body.min_alter_stunden ?? 24;
    const maxLoeschen = body.max_loeschen ?? 200;
    const dryRun = body.dry_run === true;
    const supabase = createServiceClient();

    const cutoffIso = new Date(Date.now() - minAlterStunden * 60 * 60 * 1000).toISOString();

    // Orphans-Identifikation: storage.objects LEFT JOIN dokumente
    // auf storage_pfad. Wir wollen nur Files die älter als cutoff sind UND
    // keinen dokumente-Eintrag haben.
    const { data: orphans, error: queryErr } = await supabase.rpc(
      "find_orphan_dokumente_pdfs",
      { p_cutoff: cutoffIso, p_limit: maxLoeschen },
    );

    if (queryErr) {
      logError(ROUTE_TAG, "Orphan-Query fehlgeschlagen", queryErr);
      return NextResponse.json({ error: "Query fehlgeschlagen", detail: queryErr.message }, { status: 500 });
    }

    const orphanList = (orphans ?? []) as { name: string; size_bytes: number | null; created_at: string }[];
    const orphanCount = orphanList.length;
    const orphanBytes = orphanList.reduce((sum, o) => sum + (o.size_bytes ?? 0), 0);

    logInfo(ROUTE_TAG, "Orphan-Inventur", {
      orphan_count: orphanCount,
      orphan_mb: Math.round(orphanBytes / 1024 / 1024 * 100) / 100,
      min_alter_stunden: minAlterStunden,
      max_loeschen: maxLoeschen,
      dry_run: dryRun,
    });

    // Audit-Log VOR Delete (überlebt auch bei Storage-API-Fehler)
    await supabase.from("webhook_logs").insert({
      typ: "cron_cleanup_orphans",
      status: "info",
      fehler_text: `${dryRun ? "DRY-RUN: " : ""}${orphanCount} Orphan-PDFs (≥${minAlterStunden}h alt, max ${maxLoeschen}), ${Math.round(orphanBytes / 1024 / 1024 * 100) / 100} MB`,
    });

    if (dryRun || orphanCount === 0) {
      return NextResponse.json({
        success: true,
        dry_run: dryRun,
        orphan_count: orphanCount,
        orphan_mb: Math.round(orphanBytes / 1024 / 1024 * 100) / 100,
        sample: orphanList.slice(0, 10).map((o) => ({ name: o.name, size_kb: Math.round((o.size_bytes ?? 0) / 1024) })),
        deleted: 0,
      });
    }

    // Storage-API: remove() akzeptiert Array von Pfaden, max 1000 pro Call
    const paths = orphanList.map((o) => o.name);
    const { data: removed, error: removeErr } = await supabase.storage.from(BUCKET).remove(paths);

    if (removeErr) {
      logError(ROUTE_TAG, "Storage.remove fehlgeschlagen", removeErr);
      await supabase.from("webhook_logs").insert({
        typ: "cron_cleanup_orphans",
        status: "error",
        fehler_text: `Storage.remove-Fehler: ${removeErr.message} (${orphanCount} Pfade)`,
      });
      return NextResponse.json({ error: "Storage-Delete fehlgeschlagen", detail: removeErr.message }, { status: 500 });
    }

    const deletedCount = removed?.length ?? 0;

    await supabase.from("webhook_logs").insert({
      typ: "cron_cleanup_orphans",
      status: "success",
      fehler_text: `${deletedCount} von ${orphanCount} Orphan-PDFs gelöscht (~${Math.round(orphanBytes / 1024 / 1024 * 100) / 100} MB)`,
    });

    return NextResponse.json({
      success: true,
      dry_run: false,
      orphan_count: orphanCount,
      deleted: deletedCount,
      freed_mb: Math.round(orphanBytes / 1024 / 1024 * 100) / 100,
    });
  } catch (err) {
    logError(ROUTE_TAG, "Unerwarteter Fehler", err);

    try {
      const supabase = createServiceClient();
      await supabase.from("webhook_logs").insert({
        typ: "cron_cleanup_orphans",
        status: "error",
        fehler_text: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    } catch { /* Log-Fehler nicht propagieren */ }

    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
