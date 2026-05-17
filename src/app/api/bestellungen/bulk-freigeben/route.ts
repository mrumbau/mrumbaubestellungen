/**
 * POST /api/bestellungen/bulk-freigeben — Mehrere Bestellungen freigeben.
 *
 * 11.05.2026 — Bulk-Variante des Single-Freigabe-Endpoints. Pro ID:
 *   - Status-Check (!= freigegeben)
 *   - Berechtigung-Check (admin ODER eigene Bestellung ODER SU/Abo)
 *   - Rechnungs-Check (hat_rechnung=true; ohne Rechnung keine Freigabe)
 *   - freigeben_bestellung-RPC (atomar, schreibt freigaben-Row + status-Update + Audit-Event)
 *   - Audit-Kommentar im kommentare-Stream
 *
 * Response: { success, total, freigegeben, already_freigegeben, no_rechnung, no_permission, errors }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError, logInfo } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";

const ROUTE_TAG = "/api/bestellungen/bulk-freigeben";

const BodySchema = z.object({
  ids: z
    .array(z.string().uuid())
    .min(1, "Mindestens eine ID erforderlich")
    .max(100, "Maximal 100 Bestellungen pro Bulk-Aktion"),
  kommentar: z.string().max(500).optional(),
});

interface BulkFreigabeResult {
  total: number;
  freigegeben: string[];
  already_freigegeben: string[];
  no_rechnung: string[];
  no_permission: string[];
  not_found: string[];
  errors: { id: string; reason: string }[];
}

export async function POST(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    // R3b: Defense-in-Depth — Buchhaltung explizit ausschließen.
    const auth = await requireAuth(["admin", "besteller"]);
    if (auth.response) return auth.response;
    const { profil } = auth;

    const rawBody = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Body invalid", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { ids, kommentar } = parsed.data;

    const supabase = await createServerSupabaseClient();
    const result: BulkFreigabeResult = {
      total: ids.length,
      freigegeben: [],
      already_freigegeben: [],
      no_rechnung: [],
      no_permission: [],
      not_found: [],
      errors: [],
    };

    // Alle Bestellungen in einem Round-Trip laden
    const { data: bestellungen, error: loadError } = await supabase
      .from("bestellungen")
      .select("id, status, besteller_kuerzel, bestellungsart, hat_rechnung, ist_gutschrift")
      .in("id", ids);

    if (loadError) {
      logError(ROUTE_TAG, "Bulk-Load fehlgeschlagen", loadError);
      return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
    }

    const bMap = new Map((bestellungen ?? []).map((b) => [b.id, b]));

    // Saubere Audit-Kommentar-Vorlage (XSS-Schutz wie im Single-Endpoint)
    const sanitizedKommentar = kommentar
      ? kommentar.replace(/[<>"&']/g, "").slice(0, 500)
      : null;
    const auditText = sanitizedKommentar
      ? `Bestellung freigegeben (Bulk) — Kommentar: ${sanitizedKommentar}`
      : `Bestellung freigegeben (Bulk)`;

    for (const id of ids) {
      const b = bMap.get(id);
      if (!b) {
        result.not_found.push(id);
        continue;
      }

      // Berechtigungs-Check pro Bestellung
      const istSuOderAbo =
        b.bestellungsart === "subunternehmer" || b.bestellungsart === "abo";
      const darfFreigeben =
        profil.rolle === "admin" ||
        b.besteller_kuerzel === profil.kuerzel ||
        istSuOderAbo;
      if (!darfFreigeben) {
        result.no_permission.push(id);
        continue;
      }

      if (b.status === "freigegeben") {
        result.already_freigegeben.push(id);
        continue;
      }
      // 17.05.2026 — Gutschriften skippen: keine Freigabe nötig, sind direkt
      // in der Buchhaltung sichtbar. Werden als "already_freigegeben" gezählt
      // damit Bulk-Result keine false-Error-Meldung gibt.
      if (b.ist_gutschrift === true) {
        result.already_freigegeben.push(id);
        continue;
      }
      if (!b.hat_rechnung) {
        result.no_rechnung.push(id);
        continue;
      }

      // Atomare Freigabe via RPC
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        "freigeben_bestellung",
        {
          p_bestellung_id: id,
          p_kuerzel: profil.kuerzel,
          p_name: profil.name,
          p_kommentar: sanitizedKommentar,
        },
      );

      if (rpcError) {
        logError(ROUTE_TAG, `RPC-Fehler für ${id}`, rpcError);
        result.errors.push({ id, reason: rpcError.message });
        continue;
      }
      if (rpcResult?.success === false) {
        if (rpcResult.error === "bereits_freigegeben") {
          result.already_freigegeben.push(id);
          continue;
        }
        logError(ROUTE_TAG, `RPC-Result-Fehler für ${id}`, rpcResult);
        result.errors.push({ id, reason: rpcResult.error ?? "rpc_unbekannt" });
        continue;
      }

      // Audit-Kommentar (analog Single-Endpoint, F5.3).
      // 12.05.2026 (Freigabe-Bug-Wurzel): try/catch damit ein einzelner
      // kommentar-INSERT-Fail nicht die ganze Bulk-Loop abbricht oder die
      // Freigabe als "errored" markiert (Freigabe selbst ist via RPC schon
      // committed). Fehler nur loggen, weiter zum nächsten ID.
      try {
        const { error: kommentarErr } = await supabase.from("kommentare").insert({
          bestellung_id: id,
          autor_kuerzel: profil.kuerzel,
          autor_name: profil.name,
          text: auditText,
        });
        if (kommentarErr) {
          logError(ROUTE_TAG, `Audit-Kommentar fehlgeschlagen für ${id} (Freigabe selbst OK)`, kommentarErr);
        }
      } catch (kommentarErr) {
        logError(ROUTE_TAG, `Audit-Kommentar throw für ${id} (Freigabe selbst OK)`, kommentarErr);
      }

      result.freigegeben.push(id);
    }

    logInfo(ROUTE_TAG, "Bulk-Freigeben abgeschlossen", {
      executed_by: profil.kuerzel,
      total: result.total,
      freigegeben: result.freigegeben.length,
      already: result.already_freigegeben.length,
      no_rechnung: result.no_rechnung.length,
      no_permission: result.no_permission.length,
      not_found: result.not_found.length,
      errors: result.errors.length,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    logError(ROUTE_TAG, "Unerwarteter Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
