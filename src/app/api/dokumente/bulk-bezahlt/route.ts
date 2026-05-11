/**
 * POST /api/dokumente/bulk-bezahlt — Mehrere Rechnungs-Dokumente als bezahlt markieren.
 *
 * 11.05.2026 — analog zu /api/dokumente/[id]/bezahlt, aber für Bulk-Aktionen
 * im Buchhaltung-Selection-Mode. Pro Doku:
 *   - Status-Check (muss freigegeben sein, Typ rechnung)
 *   - Idempotenz (bereits bezahlt → already_paid Zähler)
 *   - Atomic Update mit bezahlt_am IS NULL Guard
 *   - DATEV-Versand im Hintergrund (sequential, nicht parallel — SMTP-rate-limit-safe)
 *
 * Response: { success, total, marked, already_paid, skipped, errors }
 */

import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError, logInfo } from "@/lib/logger";
import { requireRoles } from "@/lib/auth";
import { sendeRechnungAnDatev, stempelPdfMitDatev } from "@/lib/email";

const ROUTE_TAG = "/api/dokumente/bulk-bezahlt";

const BodySchema = z.object({
  ids: z
    .array(z.string().uuid())
    .min(1, "Mindestens eine ID erforderlich")
    .max(100, "Maximal 100 Dokumente pro Bulk-Aktion"),
});

interface BulkResult {
  total: number;
  marked: string[];
  already_paid: string[];
  skipped: { id: string; reason: string }[];
  errors: { id: string; reason: string }[];
}

export async function POST(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const { data: profil } = await supabase
      .from("benutzer_rollen")
      .select("*")
      .eq("user_id", user.id)
      .single();
    if (!profil) {
      return NextResponse.json({ error: ERRORS.KEIN_PROFIL }, { status: 403 });
    }
    if (!requireRoles(profil, "buchhaltung", "admin")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const rawBody = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Body invalid", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { ids } = parsed.data;

    const serviceClient = createServiceClient();
    const result: BulkResult = {
      total: ids.length,
      marked: [],
      already_paid: [],
      skipped: [],
      errors: [],
    };

    // Alle Dokumente in einem Round-Trip laden mit Bestellung-Join
    const { data: dokus, error: loadError } = await serviceClient
      .from("dokumente")
      .select(
        "id, typ, storage_pfad, bezahlt_am, gesamtbetrag, bestellnummer_erkannt, bestellung_id, bestellung:bestellungen!inner(id, status, bestellnummer, haendler_name, betrag)",
      )
      .in("id", ids);

    if (loadError) {
      logError(ROUTE_TAG, "Bulk-Load fehlgeschlagen", loadError);
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    const dokuMap = new Map((dokus ?? []).map((d) => [d.id, d]));
    const datevQueue: Array<{
      dokumentId: string;
      storagePfad: string;
      bestellnummer: string | null;
      haendlerName: string | null;
      gesamtbetrag: number | null;
      bestellungId: string;
    }> = [];

    for (const id of ids) {
      const doku = dokuMap.get(id);
      if (!doku) {
        result.skipped.push({ id, reason: "nicht_gefunden" });
        continue;
      }
      if (doku.typ !== "rechnung") {
        result.skipped.push({ id, reason: "kein_rechnungsdokument" });
        continue;
      }
      const bestellung = (doku.bestellung as unknown) as {
        id: string;
        status: string;
        bestellnummer: string | null;
        haendler_name: string | null;
        betrag: number | null;
      } | null;
      if (!bestellung) {
        result.skipped.push({ id, reason: "bestellung_fehlt" });
        continue;
      }
      if (bestellung.status !== "freigegeben") {
        result.skipped.push({ id, reason: "nicht_freigegeben" });
        continue;
      }
      if (doku.bezahlt_am) {
        result.already_paid.push(id);
        continue;
      }

      // Atomic Update mit bezahlt_am IS NULL Guard (race-safe gegen parallele Single-Updates)
      const { error: updateError, count } = await serviceClient
        .from("dokumente")
        .update(
          { bezahlt_am: new Date().toISOString(), bezahlt_von: profil.name },
          { count: "exact" },
        )
        .eq("id", id)
        .is("bezahlt_am", null);

      if (updateError) {
        logError(ROUTE_TAG, `Update fehlgeschlagen für ${id}`, updateError);
        result.errors.push({ id, reason: updateError.message });
        continue;
      }
      if (count === 0) {
        // Race-Condition: jemand anderes hat parallel markiert
        result.already_paid.push(id);
        continue;
      }

      result.marked.push(id);
      if (doku.storage_pfad) {
        datevQueue.push({
          dokumentId: id,
          storagePfad: doku.storage_pfad,
          bestellnummer: doku.bestellnummer_erkannt || bestellung.bestellnummer,
          haendlerName: bestellung.haendler_name || null,
          gesamtbetrag: doku.gesamtbetrag ?? bestellung.betrag,
          bestellungId: bestellung.id,
        });
      }
    }

    // DATEV-Versand im Hintergrund, sequential (vermeidet SMTP-Rate-Limit)
    if (datevQueue.length > 0) {
      after(async () => {
        const svc = createServiceClient();
        for (const item of datevQueue) {
          try {
            const { data: pdfData, error: dlError } = await svc.storage
              .from("dokumente")
              .download(item.storagePfad);
            if (!pdfData || dlError) {
              logError(ROUTE_TAG, `DATEV: PDF-Download für ${item.dokumentId} fehlgeschlagen`, dlError);
              continue;
            }
            const rawBuffer = Buffer.from(await pdfData.arrayBuffer());
            const filename = item.storagePfad.split("/").pop() || "rechnung.pdf";

            const pdfBuffer = await stempelPdfMitDatev(rawBuffer, {
              bestellnummer: item.bestellnummer,
              haendlerName: item.haendlerName,
              bezahltAm: new Date(),
              bezahltVon: profil.name,
              betrag: item.gesamtbetrag,
            });

            const sendResult = await sendeRechnungAnDatev({
              bestellnummer: item.bestellnummer,
              haendlerName: item.haendlerName || "Unbekannt",
              betrag: item.gesamtbetrag,
              pdfBuffer,
              pdfFilename: filename,
            });

            await svc.from("webhook_logs").insert({
              typ: "email",
              status: sendResult.success ? "success" : "error",
              bestellung_id: item.bestellungId,
              fehler_text: sendResult.success
                ? `DATEV-Versand (Bulk) erfolgreich: ${item.haendlerName ?? "?"} ${item.bestellnummer ?? ""}`
                : `DATEV-Versand (Bulk) fehlgeschlagen: ${sendResult.error}`,
            });
          } catch (err) {
            logError(ROUTE_TAG, `DATEV-Versand für ${item.dokumentId} Exception`, err);
            try {
              await svc.from("webhook_logs").insert({
                typ: "email",
                status: "error",
                bestellung_id: item.bestellungId,
                fehler_text: `DATEV-Bulk-Versand Exception: ${err instanceof Error ? err.message : String(err)}`,
              });
            } catch {
              /* swallow nested */
            }
          }
        }
      });
    }

    logInfo(ROUTE_TAG, "Bulk-Bezahlt abgeschlossen", {
      executed_by: profil.kuerzel,
      total: result.total,
      marked: result.marked.length,
      already_paid: result.already_paid.length,
      skipped: result.skipped.length,
      errors: result.errors.length,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    logError(ROUTE_TAG, "Unerwarteter Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
