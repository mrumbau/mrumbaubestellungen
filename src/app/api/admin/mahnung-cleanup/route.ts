/**
 * POST /api/admin/mahnung-cleanup
 *
 * Findet bestehende Mahnstufen die fachlich nicht mehr plausibel sind
 * und kann sie auf 0 / NULL zurücksetzen. Hintergrund: vor der Defense-
 * Härtung in classify-logic + RPC wurden mahnung_count-Werte hochgezählt
 * obwohl:
 *   - keine Rechnung hinterlegt war
 *   - die Bestellung als bezahlt markiert war
 *   - eine Rechnung als PayPal-bezahlt erkannt wurde
 *   - der Backfill dieselbe Mahn-Mail mehrfach zählte (Counter > 3)
 *
 * Sicherheits-Modell:
 *   - Admin + Besteller (Firmeninhaber). Buchhaltung 403.
 *   - CSRF-Check, JSON Body.
 *   - dryRun=true verändert NICHTS in der DB.
 *   - Kategorien:
 *       reset    → eindeutig falsch (keine Rechnung / bezahlt / PayPal)
 *       review   → mahnung_count > 3 ohne klar identifizierbare Quelle
 *                  (wird NICHT automatisch zurückgesetzt — User muss prüfen)
 *
 * Body:
 *   { dryRun?: boolean = true }
 *
 * Response:
 *   {
 *     dryRun,
 *     total_with_mahnung,
 *     candidates_to_reset,
 *     candidates_to_review,
 *     reset_done,
 *     errors,
 *     examples: [{ bestellung_id, haendler_name, bestellnummer,
 *                  mahnung_count, mahnung_am, hat_rechnung, bezahlt_am,
 *                  paypal_bezahlt, kategorie, grund }]
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { getBenutzerProfil, requireRoles } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError, logInfo } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Maximal so viele Reset-UPDATEs pro Aufruf — Schutz gegen Runaway. */
const MAX_RESETS_PER_CALL = 500;

/** Mahnstufen über diesem Schwellwert ohne klare Quelle → Review. */
const REVIEW_STUFE_SCHWELLE = 3;

const BodySchema = z
  .object({ dryRun: z.boolean().optional() })
  .strict();

type Kategorie = "reset" | "review";

interface RawBestellung {
  id: string;
  bestellnummer: string | null;
  haendler_name: string | null;
  mahnung_count: number | null;
  mahnung_am: string | null;
  hat_rechnung: boolean | null;
  bezahlt_am: string | null;
  status: string | null;
  dokumente: Array<{ typ: string | null; bezahlt_bereits: boolean | null }> | null;
}

interface Example {
  bestellung_id: string;
  haendler_name: string | null;
  bestellnummer: string | null;
  mahnung_count: number;
  mahnung_am: string | null;
  hat_rechnung: boolean;
  bezahlt_am: string | null;
  paypal_bezahlt: boolean;
  kategorie: Kategorie;
  grund: string;
}

interface CleanupResult {
  dryRun: boolean;
  total_with_mahnung: number;
  candidates_to_reset: number;
  candidates_to_review: number;
  reset_done: number;
  errors: Array<{ bestellung_id: string; reason: string }>;
  examples: Example[];
  duration_ms: number;
}

/**
 * Kategorisiert eine Bestellung mit mahnung_count > 0. Liefert
 *   - "reset" wenn die Mahnung fachlich nicht haltbar ist (keine Rechnung /
 *     bezahlt_am / PayPal-Doku / terminaler Status). Backfill setzt zurück.
 *   - "review" wenn die Mahnung möglicherweise echt ist, aber Stufe > 3
 *     ohne anderen Indikator → User muss manuell prüfen.
 *   - null wenn die Mahnung plausibel ist (kein Cleanup nötig).
 */
function kategorisieren(b: RawBestellung): { kategorie: Kategorie | null; grund: string } {
  const paypalBezahlt = (b.dokumente ?? []).some(
    (d) => d.typ === "rechnung" && d.bezahlt_bereits === true,
  );
  const terminalStatus =
    b.status === "freigegeben" || b.status === "verworfen" || b.status === "storniert";

  if (b.bezahlt_am) {
    return { kategorie: "reset", grund: "bezahlt_am gesetzt" };
  }
  if (paypalBezahlt) {
    return { kategorie: "reset", grund: "Rechnung als PayPal-bezahlt erkannt" };
  }
  if (b.hat_rechnung !== true) {
    return { kategorie: "reset", grund: "keine Rechnung hinterlegt" };
  }
  if (terminalStatus) {
    return { kategorie: "reset", grund: `terminaler Status: ${b.status}` };
  }
  if ((b.mahnung_count ?? 0) > REVIEW_STUFE_SCHWELLE) {
    return {
      kategorie: "review",
      grund: `Mahnstufe ${b.mahnung_count} ohne klare Quelle (> ${REVIEW_STUFE_SCHWELLE})`,
    };
  }
  return { kategorie: null, grund: "" };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  if (!checkCsrf(request)) {
    return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
  }

  const profil = await getBenutzerProfil();
  if (!requireRoles(profil, "admin", "besteller")) {
    return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
  }

  const rawBody = await request.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Body invalid (erwartet: { dryRun?: bool })",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const dryRun = parsed.data.dryRun ?? true;

  const result: CleanupResult = {
    dryRun,
    total_with_mahnung: 0,
    candidates_to_reset: 0,
    candidates_to_review: 0,
    reset_done: 0,
    errors: [],
    examples: [],
    duration_ms: 0,
  };

  const supabase = createServiceClient();

  try {
    // 1) Alle Bestellungen mit Mahn-Counter > 0
    const { data: bestellungen, error: queryErr } = await supabase
      .from("bestellungen")
      .select(
        "id, bestellnummer, haendler_name, mahnung_count, mahnung_am, hat_rechnung, bezahlt_am, status, dokumente(typ, bezahlt_bereits)",
      )
      .gt("mahnung_count", 0)
      .order("mahnung_count", { ascending: false })
      .limit(MAX_RESETS_PER_CALL * 2);

    if (queryErr) {
      logError("mahnung-cleanup", "Bestellungs-Query fehlgeschlagen", queryErr);
      return NextResponse.json(
        { error: `DB-Query fehlgeschlagen: ${queryErr.message}` },
        { status: 500 },
      );
    }

    const rows = (bestellungen ?? []) as RawBestellung[];
    result.total_with_mahnung = rows.length;

    // 2) Kategorisierung
    const resetKandidaten: Array<{ row: RawBestellung; grund: string }> = [];
    const reviewKandidaten: Array<{ row: RawBestellung; grund: string }> = [];

    for (const row of rows) {
      const { kategorie, grund } = kategorisieren(row);
      if (kategorie === "reset") resetKandidaten.push({ row, grund });
      else if (kategorie === "review") reviewKandidaten.push({ row, grund });
    }

    result.candidates_to_reset = resetKandidaten.length;
    result.candidates_to_review = reviewKandidaten.length;

    // 3) Beispiele für UI/Audit — bis zu 10 pro Kategorie gemischt
    const beispieleMix = [
      ...resetKandidaten.slice(0, 7),
      ...reviewKandidaten.slice(0, 3),
    ];
    result.examples = beispieleMix.map(({ row, grund }) => ({
      bestellung_id: row.id,
      haendler_name: row.haendler_name,
      bestellnummer: row.bestellnummer,
      mahnung_count: row.mahnung_count ?? 0,
      mahnung_am: row.mahnung_am,
      hat_rechnung: row.hat_rechnung === true,
      bezahlt_am: row.bezahlt_am,
      paypal_bezahlt: (row.dokumente ?? []).some(
        (d) => d.typ === "rechnung" && d.bezahlt_bereits === true,
      ),
      kategorie: resetKandidaten.some((k) => k.row.id === row.id) ? "reset" : "review",
      grund,
    }));

    // 4) DryRun? Fertig, keine Schreibvorgänge.
    if (dryRun) {
      result.duration_ms = Date.now() - startTime;
      logInfo("mahnung-cleanup", "DryRun ausgeführt", {
        total: result.total_with_mahnung,
        reset: result.candidates_to_reset,
        review: result.candidates_to_review,
      });
      return NextResponse.json(result);
    }

    // 5) Echter Lauf — NUR reset-Kandidaten patchen. Review bleibt unangetastet.
    for (const { row } of resetKandidaten.slice(0, MAX_RESETS_PER_CALL)) {
      try {
        const { error: upErr } = await supabase
          .from("bestellungen")
          .update({
            mahnung_count: 0,
            mahnung_am: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (upErr) {
          result.errors.push({ bestellung_id: row.id, reason: upErr.message });
          continue;
        }
        result.reset_done++;
      } catch (err) {
        result.errors.push({
          bestellung_id: row.id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    result.duration_ms = Date.now() - startTime;
    logInfo("mahnung-cleanup", "Reset-Lauf abgeschlossen", {
      reset_done: result.reset_done,
      errors: result.errors.length,
    });
    return NextResponse.json(result);
  } catch (err) {
    result.duration_ms = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    logError("mahnung-cleanup", "Unerwartete Exception", { err: msg });
    return NextResponse.json(
      { ...result, error: `Cleanup abgebrochen: ${msg}` },
      { status: 500 },
    );
  }
}
