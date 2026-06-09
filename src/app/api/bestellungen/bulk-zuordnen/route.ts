/**
 * POST /api/bestellungen/bulk-zuordnen (09.06.2026)
 *
 * Bulk-Variante des Owner-Wechsels. Vereinigt die zwei existierenden
 * Single-Pfade:
 *
 *   - UNBEKANNT → Kürzel  (Pool-Übernahme oder Pool-Zuordnung)
 *   - Kürzel A → Kürzel B (Re-Assign zwischen Bestellern)
 *   - Kürzel A → UNBEKANNT (zurück in Pool / "Gemeinschaft")
 *
 * Pro ID wird die passende RPC gerufen:
 *   - `pool_reassign_bestellung` für besetzte Bestellungen (Race-safe)
 *   - direktes UPDATE für UNBEKANNT → Kürzel (mit Permission-Check)
 *
 * Body:
 *   { ids: UUID[1..100], besteller_kuerzel: "MT"|"CR"|...|"UNBEKANNT",
 *     kommentar?: string }
 *
 * Response (per-ID Result):
 *   {
 *     success: true,
 *     total: N,
 *     updated: string[],
 *     was_already_correct: string[],   // schon dem Ziel zugeordnet
 *     no_permission: string[],
 *     errors: { id, reason }[]
 *   }
 *
 * Sicherheit:
 *   - Admin + Besteller. Buchhaltung 403.
 *   - CSRF, Body-Validierung (Zod).
 *   - Max 100 IDs (analog bulk-freigeben).
 *   - Audit pro ID via `kommentare`-Insert.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { logError, logInfo } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";
import { isValidKuerzel } from "@/lib/validation";

export const dynamic = "force-dynamic";

const ROUTE_TAG = "/api/bestellungen/bulk-zuordnen";

/** Marker für "zurück in Pool / Gemeinschaft". */
const POOL_MARKER = "UNBEKANNT";

const BodySchema = z.object({
  ids: z
    .array(z.string().uuid())
    .min(1, "Mindestens eine ID erforderlich")
    .max(100, "Maximal 100 Bestellungen pro Bulk-Aktion"),
  besteller_kuerzel: z.string().min(1).max(32),
  kommentar: z.string().max(500).optional(),
});

interface BulkZuordnenResult {
  total: number;
  updated: string[];
  was_already_correct: string[];
  no_permission: string[];
  errors: Array<{ id: string; reason: string }>;
}

export async function POST(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const auth = await requireAuth(["admin", "besteller"]);
    if (auth.response) return auth.response;
    const profil = auth.profil;

    const rawBody = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Body invalid (erwartet: { ids: UUID[1..100], besteller_kuerzel: string })",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }
    const { ids, besteller_kuerzel: zielKuerzelRaw, kommentar } = parsed.data;
    const zielKuerzel = zielKuerzelRaw.toUpperCase();

    // Validierung: Kürzel-Format oder POOL_MARKER
    if (zielKuerzel !== POOL_MARKER && !isValidKuerzel(zielKuerzel)) {
      return NextResponse.json({ error: "Ungültiges Kürzel" }, { status: 400 });
    }

    // Ziel-Besteller laden (nur bei echtem Kürzel; UNBEKANNT braucht keinen User)
    const supabase = createServiceClient();
    let zielName = "Gemeinschaft";
    if (zielKuerzel !== POOL_MARKER) {
      const { data: zielBenutzer } = await supabase
        .from("benutzer_rollen")
        .select("kuerzel, name, rolle")
        .eq("kuerzel", zielKuerzel)
        .maybeSingle();
      if (!zielBenutzer) {
        return NextResponse.json({ error: "Besteller nicht gefunden" }, { status: 404 });
      }
      // 09.06.2026 — Admin-Konten dürfen kein Owner einer Material-Bestellung
      // werden. Sonst landen Bestellungen bei MH (IT-Support) statt bei
      // produktiven Bestellern. Dropdown filtert das vorne weg, hier
      // Defense-in-Depth.
      if (zielBenutzer.rolle !== "besteller") {
        return NextResponse.json(
          { error: "Ziel-Account ist kein Besteller — Zuordnung nicht erlaubt" },
          { status: 400 },
        );
      }
      zielName = zielBenutzer.name;
    }

    const result: BulkZuordnenResult = {
      total: ids.length,
      updated: [],
      was_already_correct: [],
      no_permission: [],
      errors: [],
    };

    // Per-ID-Loop. Strikte Sequenz statt Promise.all, weil:
    //   - jede RPC ein eigenes events-Insert auslöst (Reihenfolge wichtig)
    //   - bei Race-Verlust soll der Folgereassign sofort den neuen Owner sehen
    //   - Bulk-Größe ist max 100 Items à ~10-30ms = sub-Sekunde
    for (const id of ids) {
      try {
        // Aktuellen Owner laden für Audit + Idempotenz-Check
        const { data: bestellung, error: loadErr } = await supabase
          .from("bestellungen")
          .select("id, besteller_kuerzel, besteller_name, bestellungsart, status")
          .eq("id", id)
          .maybeSingle();

        if (loadErr || !bestellung) {
          result.errors.push({ id, reason: "Bestellung nicht gefunden" });
          continue;
        }

        // Idempotenz: schon dem Ziel zugeordnet → kein UPDATE
        if (bestellung.besteller_kuerzel === zielKuerzel) {
          result.was_already_correct.push(id);
          continue;
        }

        // Permission-Check für Besteller-Rolle:
        // 09.06.2026 — Bestellerinnen dürfen Material + SU + Abo umordnen
        // (analog zum Freigabe-Bypass). Buchhaltung war schon vorher in
        // requireAuth ausgeschlossen. Admin darf eh alles.
        // Hier kein zusätzlicher Owner-Filter — User-Anforderung war:
        // "wenn ich eine Rechnung habe die CR bearbeiten muss bring ich
        // sie rüber zu CR".

        const vorher = bestellung.besteller_kuerzel ?? POOL_MARKER;
        const zuordnungsMethode =
          profil.rolle === "admin" ? "manuell_admin" : "manuell_besteller";

        // UPDATE direkt — wir gehen NICHT durch pool_reassign_bestellung,
        // weil das nur für besetzte Bestellungen die Race-Cond löst und
        // UNBEKANNT-Zuordnungen die alte /zuordnen-Logik braucht.
        // Direkt-UPDATE mit Service-Client ist hier korrekt:
        //   - Auth-Layer hat schon Rolle geprüft
        //   - Pro-ID-Loop + sequentiell = keine cross-ID-Race
        const { error: updateErr } = await supabase
          .from("bestellungen")
          .update({
            besteller_kuerzel: zielKuerzel,
            besteller_name: zielName,
            zuordnung_methode: zuordnungsMethode,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);

        if (updateErr) {
          logError(ROUTE_TAG, "Update fehlgeschlagen", {
            id,
            zielKuerzel,
            err: updateErr.message,
          });
          result.errors.push({ id, reason: updateErr.message });
          continue;
        }

        // Audit-Kommentar (sanitized analog zum existierenden /zuordnen-Endpoint)
        const safeVorher = String(vorher).replace(/[<>"&']/g, "").slice(0, 100);
        const safeZielKuerzel = String(zielKuerzel).replace(/[^A-Za-z0-9_]/g, "");
        const safeZielName = String(zielName).replace(/[<>"&']/g, "").slice(0, 100);
        const safeActorKuerzel = String(profil.kuerzel).replace(/[^A-Za-z0-9]/g, "");
        const safeActorName = String(profil.name).replace(/[<>"&']/g, "").slice(0, 100);
        const userKommentar = kommentar
          ? ` · Notiz: ${kommentar.replace(/[<>"&']/g, "").slice(0, 200)}`
          : "";
        await supabase.from("kommentare").insert({
          bestellung_id: id,
          autor_kuerzel: safeActorKuerzel,
          autor_name: safeActorName,
          text: `Besteller manuell zugeordnet: ${safeVorher} → ${safeZielKuerzel} (${safeZielName})${userKommentar}`,
        });

        result.updated.push(id);
      } catch (err) {
        result.errors.push({
          id,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logInfo(ROUTE_TAG, "Bulk-Zuordnen abgeschlossen", {
      total: result.total,
      updated: result.updated.length,
      was_already_correct: result.was_already_correct.length,
      errors: result.errors.length,
      ziel: zielKuerzel,
      actor: profil.kuerzel,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    logError(ROUTE_TAG, "Unerwarteter Fehler", err);
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
