/**
 * POST /api/email-sync/reactivate-freemail
 *
 * Admin + Besteller dürfen den Reaktivierungs-Backfill für fälschlich als
 * 'freemail' verworfene Mails ausführen. Sucht in email_processing_log
 * Einträge mit:
 *   status='irrelevant' AND error_msg='freemail'
 *   AND received_at > now() - sinceDays
 *   AND subject ILIKE ANY(%hard-keywords%)
 *
 * Treffer werden auf status='pending' zurückgesetzt — der bestehende
 * process-pending-Cron holt sie ab und durchläuft die NEUE classify-logic
 * (post-09.06.2026-Fix), die den Inhalts-Override enthält.
 *
 * Body:
 *   {
 *     dryRun?: boolean (default false)
 *     sinceDays?: number (1-90, default 30)
 *   }
 *
 * Sicherheit:
 *   - Admin oder Besteller (Buchhaltung ausgeschlossen — Sync ist nicht
 *     ihre Domäne, analog zu /folders/[id]/backfill).
 *   - CSRF-Check.
 *   - sinceDays auf 1-90 begrenzt (gegen versehentlich riesige Backfills).
 *   - dryRun verändert NICHTS in der DB.
 *   - Keywords sind hardcodet (kein User-Input → keine SQL-Injection).
 *   - Idempotent: erneuter Lauf findet keine erneuten Treffer, weil
 *     bereits reaktivierte Mails status='pending' haben, nicht
 *     status='irrelevant'.
 *   - Reaktiviert NUR Mails mit kaufmännischen Hard-Keywords im Subject.
 *     Marketing/Newsletter mit Weich-Signalen bleiben verworfen.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { getBenutzerProfil, requireRoles } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError, logInfo } from "@/lib/logger";

export const dynamic = "force-dynamic";

const MAX_DAYS = 90;
const DEFAULT_DAYS = 30;
/** Hartes Limit pro Aufruf — Pipeline-Cron arbeitet pro Tick max 20 ab. */
const MAX_REACTIVATIONS_PER_CALL = 500;

/**
 * Hard-Signale für die Backfill-Suche.
 * MUSS synchron bleiben mit FREEMAIL_HARD_SIGNALE in
 * src/lib/email-pipeline/classify-logic.ts.
 *
 * Eng auf Rechnungs-/Zahlungs-/Mahn-/Gutschrift-/Lieferschein-Welt
 * begrenzt. Bestellungen, Auftragsbestätigungen, Angebote sind BEWUSST
 * NICHT enthalten — der Backfill darf keine Welle normaler Webshop-
 * Mails ins Bestellwesen pumpen.
 */
const HARD_KEYWORDS = [
  "rechnung", "mahnung", "zahlungserinnerung", "zahlungsaufforderung",
  "lieferschein", "gutschrift",
  "rechnungsnummer",
  "betrag", "fällig", "faellig", "bezahlt",
];

const BodySchema = z
  .object({
    dryRun: z.boolean().optional(),
    sinceDays: z.number().int().positive().max(MAX_DAYS).optional(),
  })
  .strict();

interface Example {
  received_at: string | null;
  sender: string | null;
  subject: string | null;
  reason: string;
}

interface ReactivateResult {
  dryRun: boolean;
  sinceDays: number;
  sinceIso: string;
  total_found: number;
  candidates_for_reactivation: number;
  reactivated: number;
  skipped: number;
  errors: Array<{ internet_message_id: string; reason: string }>;
  examples: Example[];
  duration_ms: number;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // 1. CSRF
  if (!checkCsrf(request)) {
    return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
  }

  // 2. Auth: Admin + Besteller. Buchhaltung explizit nicht.
  const profil = await getBenutzerProfil();
  if (!requireRoles(profil, "admin", "besteller")) {
    return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
  }

  // 3. Body
  const rawBody = await request.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Body invalid (erwartet: { dryRun?: bool, sinceDays?: 1-90 })",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const dryRun = parsed.data.dryRun ?? false;
  const sinceDays = parsed.data.sinceDays ?? DEFAULT_DAYS;

  const sinceIso = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)
    .toISOString();

  const result: ReactivateResult = {
    dryRun,
    sinceDays,
    sinceIso,
    total_found: 0,
    candidates_for_reactivation: 0,
    reactivated: 0,
    skipped: 0,
    errors: [],
    examples: [],
    duration_ms: 0,
  };

  const supabase = createServiceClient();

  try {
    // 4. Erst: ALLE Freemail-Drops im Zeitfenster — für total_found-Statistik
    const { count: totalFreemailDrops, error: countErr } = await supabase
      .from("email_processing_log")
      .select("internet_message_id", { count: "exact", head: true })
      .eq("status", "irrelevant")
      .eq("error_msg", "freemail")
      .gte("received_at", sinceIso);

    if (countErr) {
      logError("reactivate-freemail", "Count-Query fehlgeschlagen", countErr);
      return NextResponse.json(
        { error: `Count-Query fehlgeschlagen: ${countErr.message}` },
        { status: 500 },
      );
    }
    result.total_found = totalFreemailDrops ?? 0;

    // 5. Kandidaten: Subject ODER subject... wir nutzen das OR-Pattern.
    // Postgres ILIKE in `or` — Supabase-JS-Builder erwartet OR-String mit
    // Komma-Separierten Conditions.
    const orFilter = HARD_KEYWORDS.map(
      (kw) => `subject.ilike.%${kw}%`,
    ).join(",");

    const { data: candidates, error: candErr } = await supabase
      .from("email_processing_log")
      .select("internet_message_id, received_at, sender, subject")
      .eq("status", "irrelevant")
      .eq("error_msg", "freemail")
      .gte("received_at", sinceIso)
      .or(orFilter)
      .order("received_at", { ascending: false })
      .limit(MAX_REACTIVATIONS_PER_CALL);

    if (candErr) {
      logError("reactivate-freemail", "Kandidaten-Query fehlgeschlagen", candErr);
      return NextResponse.json(
        { error: `Kandidaten-Query fehlgeschlagen: ${candErr.message}` },
        { status: 500 },
      );
    }

    result.candidates_for_reactivation = (candidates ?? []).length;
    result.skipped = result.total_found - result.candidates_for_reactivation;

    // 6. Beispiele für Sichtprüfung
    result.examples = (candidates ?? [])
      .slice(0, 10)
      .map((c) => {
        const matchedKw = HARD_KEYWORDS.find((kw) =>
          (c.subject ?? "").toLowerCase().includes(kw),
        );
        return {
          received_at: c.received_at,
          sender: c.sender,
          subject: c.subject,
          reason: `hard-keyword: ${matchedKw ?? "unbekannt"}`,
        };
      });

    // 7. DryRun-Pfad: nichts ändern, nur Zahlen + Beispiele zurückgeben.
    if (dryRun) {
      result.duration_ms = Date.now() - startTime;
      logInfo("reactivate-freemail", "DryRun ausgeführt", {
        total_found: result.total_found,
        candidates: result.candidates_for_reactivation,
        sinceDays,
      });
      return NextResponse.json(result);
    }

    // 8. Echter Lauf — pro Kandidat UPDATE auf status='pending'.
    // Wir machen es pro-ID statt Bulk damit ein einzelner Fehler nicht
    // den ganzen Batch killt; idempotenter Fehler (z.B. concurrent update
    // durch retry-cron) wird per `eq("status", "irrelevant")` defensiv
    // geschützt — nur Mails die noch im richtigen Status sind werden gepatcht.
    for (const c of candidates ?? []) {
      try {
        const { error: upErr } = await supabase
          .from("email_processing_log")
          .update({
            status: "pending",
            error_msg: null,
            retry_count: 0,
            processed_at: null,
            check_at: null,
          })
          .eq("internet_message_id", c.internet_message_id)
          .eq("status", "irrelevant")
          .eq("error_msg", "freemail");

        if (upErr) {
          result.errors.push({
            internet_message_id: c.internet_message_id,
            reason: upErr.message,
          });
          continue;
        }
        result.reactivated++;
      } catch (err) {
        result.errors.push({
          internet_message_id: c.internet_message_id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    result.duration_ms = Date.now() - startTime;
    logInfo("reactivate-freemail", "Reaktivierungs-Lauf abgeschlossen", {
      reactivated: result.reactivated,
      errors: result.errors.length,
      sinceDays,
    });
    return NextResponse.json(result);
  } catch (err) {
    result.duration_ms = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    logError("reactivate-freemail", "Unerwartete Exception", { err: msg });
    return NextResponse.json(
      { ...result, error: `Backfill abgebrochen: ${msg}` },
      { status: 500 },
    );
  }
}
