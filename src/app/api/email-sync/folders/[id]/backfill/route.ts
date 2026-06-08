/**
 * POST /api/email-sync/folders/:id/backfill
 *
 * Admin-only Backfill: holt Mails aus Outlook-Folder direkt (kein Delta-
 * Token), prüft ob jede Mail bereits in `email_processing_log` ist und
 * fügt fehlende Mails als status='pending' ein. Bootstrap-skipped + failed
 * können re-aktiviert werden, damit Mails die durch den 08.06-Burst-Bug
 * verloren gegangen sind nachträglich in die Pipeline laufen.
 *
 * Body:
 *   {
 *     since?: string (ISO-Datum, UTC)
 *     days?: number  (alternativ: letzte N Tage, max 90)
 *     dryRun?: boolean (default false)
 *     reactivateBootstrapSkip?: boolean (default true)
 *     resetFailed?: boolean (default true)
 *   }
 *
 * Sicherheit:
 *   - Admin-only (rolle='admin')
 *   - CSRF-Check (gleiche Origin)
 *   - Maximaler Zeitraum 90 Tage
 *   - dryRun=true verändert NICHTS in der DB
 *   - Idempotent: mehrfache Ausführung erzeugt keine Duplikate (claim-Logik)
 *   - Reaktiviert NUR explizit bekannte tote Status (bootstrap_skip, failed)
 *
 * Response:
 *   {
 *     folder_name,
 *     since,
 *     dryRun,
 *     total_found,         // wieviele Mails der Graph-Folder im Zeitraum hat
 *     already_processed,   // status='processed' — nichts zu tun
 *     already_pending,     // status='pending' — wartet schon auf Pipeline
 *     newly_claimed,       // neu eingereiht
 *     reactivated_bootstrap_skip,  // status='irrelevant'+'bootstrap_skip' → 'pending'
 *     reset_failed,        // status='failed' → retry_count=0
 *     skipped,             // status='irrelevant' aus anderem Grund (z.B. classify) — nicht angefasst
 *     errors: [{ internet_message_id, reason }],
 *     pages_read,
 *     duration_ms
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { getBenutzerProfil, requireRoles } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError, logInfo } from "@/lib/logger";
import { isValidUUID } from "@/lib/validation";
import { listMessagesSince } from "@/lib/microsoft-graph/messages";

export const dynamic = "force-dynamic";

const MAX_DAYS = 90;
const MAX_PAGES = 50; // 50 × 50 = max 2500 Mails pro Backfill-Aufruf

const BackfillBodySchema = z
  .object({
    since: z.string().datetime({ offset: true }).optional(),
    days: z.number().int().positive().max(MAX_DAYS).optional(),
    dryRun: z.boolean().optional(),
    reactivateBootstrapSkip: z.boolean().optional(),
    resetFailed: z.boolean().optional(),
  })
  .strict()
  .refine((d) => d.since || d.days, {
    message: "since (ISO-Datum) ODER days (1-90) erforderlich",
  });

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface BackfillResult {
  folder_name: string;
  since: string;
  dryRun: boolean;
  total_found: number;
  already_processed: number;
  already_pending: number;
  newly_claimed: number;
  reactivated_bootstrap_skip: number;
  reset_failed: number;
  skipped: number;
  errors: Array<{ internet_message_id: string; reason: string }>;
  pages_read: number;
  duration_ms: number;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const startTime = Date.now();

  // 1. CSRF
  if (!checkCsrf(request)) {
    return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
  }

  // 2. Auth: Admin-only
  const profil = await getBenutzerProfil();
  if (!requireRoles(profil, "admin")) {
    return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
  }

  // 3. ID validieren
  const { id } = await context.params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Ungültige Folder-ID" }, { status: 400 });
  }

  // 4. Body
  const rawBody = await request.json().catch(() => null);
  const parsed = BackfillBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Body invalid (erwartet: { since?: ISO, days?: 1-90, dryRun?, reactivateBootstrapSkip?, resetFailed? })",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const dryRun = body.dryRun ?? false;
  const reactivateBootstrapSkip = body.reactivateBootstrapSkip ?? true;
  const resetFailed = body.resetFailed ?? true;

  // 5. Folder laden via Service-Client (RLS-bypass; Admin hat schon geprüft)
  const supabaseAuth = await createServerSupabaseClient();
  const { data: folder, error: folderErr } = await supabaseAuth
    .from("mail_sync_folders")
    .select("id, graph_folder_id, folder_name")
    .eq("id", id)
    .maybeSingle();

  if (folderErr || !folder) {
    return NextResponse.json({ error: "Folder nicht gefunden" }, { status: 404 });
  }

  // 6. since berechnen
  let sinceIso: string;
  if (body.since) {
    const parsedDate = new Date(body.since);
    const maxAge = MAX_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() - parsedDate.getTime() > maxAge) {
      return NextResponse.json(
        { error: `since liegt mehr als ${MAX_DAYS} Tage zurück` },
        { status: 400 },
      );
    }
    sinceIso = parsedDate.toISOString().split(".")[0] + "Z";
  } else {
    const date = new Date(Date.now() - (body.days ?? 7) * 24 * 60 * 60 * 1000);
    sinceIso = date.toISOString().split(".")[0] + "Z";
  }

  const result: BackfillResult = {
    folder_name: folder.folder_name,
    since: sinceIso,
    dryRun,
    total_found: 0,
    already_processed: 0,
    already_pending: 0,
    newly_claimed: 0,
    reactivated_bootstrap_skip: 0,
    reset_failed: 0,
    skipped: 0,
    errors: [],
    pages_read: 0,
    duration_ms: 0,
  };

  // 7. Service-Client für DB-Operationen (umgeht RLS-Komplexität)
  const supabase = createServiceClient();

  try {
    for await (const batch of listMessagesSince({
      folderId: folder.graph_folder_id,
      sinceIso,
      maxPages: MAX_PAGES,
    })) {
      result.pages_read++;

      // 7a. Alle internetMessageIds dieser Page sammeln und in einem Query
      // den Log-Status abfragen — spart pro Page n DB-Roundtrips.
      const messageIds = batch
        .map((m) => m.internetMessageId)
        .filter((id): id is string => !!id);
      if (messageIds.length === 0) continue;

      const { data: existing, error: existingErr } = await supabase
        .from("email_processing_log")
        .select("internet_message_id, status, error_msg")
        .in("internet_message_id", messageIds);

      if (existingErr) {
        logError("backfill", "Log-Lookup fehlgeschlagen", existingErr);
        return NextResponse.json(
          { error: `DB-Lookup fehlgeschlagen: ${existingErr.message}` },
          { status: 500 },
        );
      }

      const existingMap = new Map(
        (existing ?? []).map((e) => [e.internet_message_id, e]),
      );

      // 7b. Pro Mail entscheiden was zu tun ist
      for (const msg of batch) {
        if (!msg.internetMessageId) continue;
        result.total_found++;

        const log = existingMap.get(msg.internetMessageId);

        // ─── Status: schon verarbeitet ──
        if (log?.status === "processed") {
          result.already_processed++;
          continue;
        }
        if (log?.status === "pending") {
          result.already_pending++;
          continue;
        }

        // ─── Status: bootstrap_skip → reaktivieren ──
        if (
          log?.status === "irrelevant" &&
          log.error_msg === "bootstrap_skip" &&
          reactivateBootstrapSkip
        ) {
          if (!dryRun) {
            const { error: upErr } = await supabase
              .from("email_processing_log")
              .update({
                status: "pending",
                error_msg: null,
                retry_count: 0,
                check_at: null,
                processed_at: null,
              })
              .eq("internet_message_id", msg.internetMessageId);
            if (upErr) {
              result.errors.push({
                internet_message_id: msg.internetMessageId,
                reason: `Reactivate fehlgeschlagen: ${upErr.message}`,
              });
              continue;
            }
          }
          result.reactivated_bootstrap_skip++;
          continue;
        }

        // ─── Status: irrelevant aus anderem Grund (z.B. classify-Filter) ──
        // Wir lassen die in Ruhe — sie wurden bewusst als nicht-Pipeline-relevant
        // markiert (z.B. Newsletter). Manual override muss explizit erfolgen.
        if (log?.status === "irrelevant") {
          result.skipped++;
          continue;
        }

        // ─── Status: failed → retry zurücksetzen ──
        if (log?.status === "failed" && resetFailed) {
          if (!dryRun) {
            const { error: upErr } = await supabase
              .from("email_processing_log")
              .update({
                status: "pending",
                error_msg: null,
                retry_count: 0,
                processed_at: null,
              })
              .eq("internet_message_id", msg.internetMessageId);
            if (upErr) {
              result.errors.push({
                internet_message_id: msg.internetMessageId,
                reason: `Reset-Failed fehlgeschlagen: ${upErr.message}`,
              });
              continue;
            }
          }
          result.reset_failed++;
          continue;
        }

        // ─── Mail nicht im Log → neu claimen ──
        if (!log) {
          if (!dryRun) {
            const { error: insErr } = await supabase
              .from("email_processing_log")
              .insert({
                internet_message_id: msg.internetMessageId,
                graph_message_id: msg.id,
                folder_id: folder.id,
                folder_hint: null,
                received_at: msg.receivedDateTime,
                sender: msg.from?.emailAddress.address ?? null,
                subject: msg.subject ?? null,
                has_attachments: msg.hasAttachments,
                status: "pending",
              });
            if (insErr) {
              // Unique-Violation kann durch parallelen Discover-Tick passieren —
              // nicht als Fehler werten, sondern als "schon pending".
              if (insErr.code === "23505") {
                result.already_pending++;
                continue;
              }
              result.errors.push({
                internet_message_id: msg.internetMessageId,
                reason: `Claim fehlgeschlagen: ${insErr.message}`,
              });
              continue;
            }
          }
          result.newly_claimed++;
          continue;
        }

        // Fallback (sollte nicht erreicht werden bei sauberen Status-Werten)
        result.skipped++;
      }
    }

    result.duration_ms = Date.now() - startTime;

    logInfo("backfill", `Backfill ${folder.folder_name}`, {
      dryRun,
      total_found: result.total_found,
      newly_claimed: result.newly_claimed,
      reactivated: result.reactivated_bootstrap_skip,
      reset_failed: result.reset_failed,
      duration_ms: result.duration_ms,
    });

    return NextResponse.json(result);
  } catch (err) {
    result.duration_ms = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    logError("backfill", "Backfill-Lauf fehlgeschlagen", { err: msg });
    return NextResponse.json(
      { ...result, error: `Backfill abgebrochen: ${msg}` },
      { status: 500 },
    );
  }
}
