import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { checkCsrf } from "@/lib/csrf";
import { ERRORS } from "@/lib/errors";
import { requireRoles } from "@/lib/auth";
import { logError, logInfo } from "@/lib/logger";

// POST /api/bestellungen/verwerfen – Bestellung verwerfen (Spam/irrelevant)
//
// 08.06.2026 (Bulk-Delete-Bug-Fix):
//   Vor diesem Fix scheiterte Bulk-Delete in der Produktion mit
//   "Bestellungen konnten nicht gelöscht werden". Root-Cause: der
//   Cleanup-Block listete nur 5 FK-Tabellen (webhook_logs, freigaben,
//   abgleiche, kommentare, dokumente) — die nach Audit eingeführten
//   pool_reservations + pool_user_state (FK auf bestellungen) waren
//   nicht dabei. Sobald eine ausgewählte Bestellung einen Pool-State
//   hatte, blockierte der FK den Parent-DELETE.
//
//   Single-Delete fiel selten auf, weil die getroffene Bestellung oft
//   keine Pool-Reservation besitzt. Bei Bulk-Auswahl von z.B. 5
//   Bestellungen steigt die Wahrscheinlichkeit auf Treffer drastisch
//   → User sah immer "fehlgeschlagen".
//
//   Sekundärer Bug: der Endpoint hat den echten DB-Fehler verschluckt
//   (return generischer Text, kein logError). Damit war der Bug auch
//   in den Logs unsichtbar. Jetzt: logError mit voller Fehler-Message
//   pro fehlgeschlagener ID + structured response mit deleted/failed.
export async function POST(request: NextRequest) {
  try {
    if (!checkCsrf(request)) {
      return NextResponse.json({ error: ERRORS.UNGUELTIGER_URSPRUNG }, { status: 403 });
    }

    const supabaseAuth = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: ERRORS.NICHT_AUTHENTIFIZIERT }, { status: 401 });
    }

    const { data: profil } = await supabaseAuth
      .from("benutzer_rollen")
      .select("rolle, kuerzel")
      .eq("user_id", user.id)
      .single();

    if (!requireRoles(profil, "admin", "besteller")) {
      return NextResponse.json({ error: ERRORS.KEINE_BERECHTIGUNG }, { status: 403 });
    }

    const body = await request.json();
    const { bestellung_id, bestellung_ids } = body;

    // Bulk oder Einzel
    const ids: string[] = bestellung_ids
      ? (bestellung_ids as string[]).filter((id: string) => isValidUUID(id))
      : bestellung_id && isValidUUID(bestellung_id)
        ? [bestellung_id]
        : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "Keine gültige Bestellungs-ID" }, { status: 400 });
    }

    if (ids.length > 50) {
      return NextResponse.json({ error: "Maximal 50 Bestellungen pro Anfrage" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Besteller dürfen verwerfen:
    //   - eigene Material-Bestellungen (besteller_kuerzel === profil.kuerzel)
    //   - SU- und Abo-Bestellungen (besteller_kuerzel meist "UNBEKANNT",
    //     gleiche Bypass-Regel wie bei Freigeben — jeder Besteller berechtigt)
    // 12.05.2026: vorher waren nur eigene Material erlaubt → SU/Abo nicht
    // verwerfbar als Besteller. Analog zu Freigabe-Bypass angeglichen.
    if (profil!.rolle === "besteller") {
      const { data: rows } = await supabase
        .from("bestellungen")
        .select("id, besteller_kuerzel, bestellungsart")
        .in("id", ids);
      const erlaubteIds = new Set(
        (rows ?? [])
          .filter(
            (r) =>
              r.besteller_kuerzel === profil!.kuerzel ||
              r.bestellungsart === "subunternehmer" ||
              r.bestellungsart === "abo",
          )
          .map((r) => r.id),
      );
      const fremde = ids.filter((id) => !erlaubteIds.has(id));
      if (fremde.length > 0) {
        return NextResponse.json(
          { error: "Keine Berechtigung für fremde Material-Bestellungen" },
          { status: 403 },
        );
      }
    }

    // Verworfene Email-Muster lernen (vor dem Löschen!)
    // 21.05.2026 — Snapshot der Bestellung + Dokumente in verworfene_emails
    // mitspeichern, damit der Audit-View "Wer hat was mit wieviel verworfen"
    // und Dokument-Link anzeigen kann. Bestellung wird unten gelöscht; ohne
    // Snapshot wäre der Audit-Eintrag nach Delete inhaltlos.
    for (const id of ids) {
      const [bestellungRes, docsRes] = await Promise.all([
        supabase
          .from("bestellungen")
          .select("id, bestellnummer, betrag")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("dokumente")
          .select("id, typ, storage_pfad, email_absender, email_betreff")
          .eq("bestellung_id", id),
      ]);

      const bestellung = bestellungRes.data;
      const docs = docsRes.data;

      if (docs && docs.length > 0) {
        const dokumenteSnapshot = docs.map((d) => ({
          id: d.id,
          typ: d.typ,
          storage_pfad: d.storage_pfad,
        }));

        const muster = docs
          .filter((d) => d.email_absender && d.email_betreff)
          .map((d) => {
            const addr = (d.email_absender || "").toLowerCase().trim();
            const domain = addr.split("@")[1] || "";
            return {
              absender_adresse: addr,
              absender_domain: domain,
              email_betreff: d.email_betreff || "",
              verworfen_von: profil!.kuerzel,
              bestellung_id: id,
              bestellnummer: bestellung?.bestellnummer ?? null,
              betrag: bestellung?.betrag ?? null,
              dokumente_snapshot: dokumenteSnapshot as unknown as Record<string, unknown>,
            };
          })
          .filter((m) => m.absender_domain);

        if (muster.length > 0) {
          await supabase.from("verworfene_emails").insert(muster);
        }
      }
    }

    // 08.06.2026 — Per-ID-Loop statt single-bulk-DELETE.
    //
    // Vorher: 5 FK-Tabellen-Cleanups in äußerer Schleife + EIN bulk DELETE
    // auf bestellungen.in(ids). Ein einziger FK-Fail (z.B. pool_reservations)
    // killte den ganzen Batch + verschluckte die Fehler-Message.
    //
    // Jetzt:
    //   1. Pro ID alle bekannten FK-Cascades + DELETE in eigenem try/catch.
    //   2. Jede ID liefert success oder failed.reason. Endpoint returnt
    //      strukturiertes Ergebnis statt 500-mit-leerer-Message.
    //   3. logError bei jedem Fail mit echter Fehler-Message + Tabellen-Hint.
    const deleted: string[] = [];
    const failed: Array<{ id: string; reason: string }> = [];

    // Hilfsfunktion: cleant eine FK-Tabelle für genau eine bestellung_id.
    // Spalten-Name ist parametrisiert weil die legacy bestellung_signale-
    // Tabelle eine abweichend benannte FK-Spalte hat (matched_bestellung_id).
    // Loggt Warnings (nicht-fatal) — bei "echtem" Block-Fehler (z.B.
    // Permission) sammelt sich der Hinweis im Log und das spätere
    // bestellungen-DELETE wird sowieso scheitern → Fehler-Pfad sauber.
    async function cleanupFkTable(
      table:
        | "webhook_logs"
        | "freigaben"
        | "abgleiche"
        | "kommentare"
        | "dokumente"
        | "pool_reservations"
        | "pool_user_state"
        | "bestellung_signale",
      bestellungId: string,
      column: "bestellung_id" | "matched_bestellung_id" = "bestellung_id",
    ): Promise<string | null> {
      const { error } = await supabase.from(table).delete().eq(column, bestellungId);
      if (error) {
        // Tabelle fehlt evtl. (legacy) oder Permission. Nicht-fatal: wir
        // versuchen trotzdem den parent-DELETE; der zeigt den echten FK-Fail.
        logInfo("verwerfen", `Cleanup ${table} fehlgeschlagen (nicht-fatal)`, {
          bestellungId,
          err: error.message,
        });
        return error.message;
      }
      return null;
    }

    for (const id of ids) {
      try {
        // 08.06.2026 — pool_reservations + pool_user_state ergänzt (Bug-Fix).
        // bestellung_signale (Chrome-Ext-Legacy, stillgelegt 22.05.2026) hat
        // die FK-Spalte matched_bestellung_id (NICHT bestellung_id) und blieb
        // deshalb beim ersten Bug-Fix-Pass übersehen — Live-Fehler zeigte
        // "bestellung_signale_matched_bestellung_id_fkey".
        //
        // Reihenfolge ist defensive: wir cleanen alle FK-Tabellen vor dem
        // parent-DELETE. Wenn EINE dieser Tabellen failt, wird das im Log
        // sichtbar; das parent-DELETE selbst zeigt dann den echten Grund.
        await cleanupFkTable("pool_reservations", id);
        await cleanupFkTable("pool_user_state", id);
        await cleanupFkTable("webhook_logs", id);
        await cleanupFkTable("freigaben", id);
        await cleanupFkTable("abgleiche", id);
        await cleanupFkTable("kommentare", id);
        await cleanupFkTable("dokumente", id);
        await cleanupFkTable("bestellung_signale", id, "matched_bestellung_id");

        // Defense-in-depth: Besteller-Filter auch im DELETE.
        // 12.05.2026: SU/Abo-Bypass eingebaut (analog Permission-Check oben).
        let deleteQuery = supabase.from("bestellungen").delete().eq("id", id);
        if (profil!.rolle === "besteller") {
          // Or-Filter: entweder eigene Material ODER SU/Abo (jeder Besteller darf das)
          deleteQuery = deleteQuery.or(
            `besteller_kuerzel.eq.${profil!.kuerzel},bestellungsart.in.(subunternehmer,abo)`,
          );
        }
        const { error: delError } = await deleteQuery;

        if (delError) {
          logError("verwerfen", `DELETE bestellung fehlgeschlagen`, {
            bestellungId: id,
            err: delError.message,
            code: (delError as { code?: string }).code,
            details: (delError as { details?: string }).details,
            hint: (delError as { hint?: string }).hint,
          });
          failed.push({ id, reason: delError.message || "Unbekannter DB-Fehler" });
        } else {
          deleted.push(id);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logError("verwerfen", `Exception bei Bestellungs-Delete`, {
          bestellungId: id,
          err: msg,
        });
        failed.push({ id, reason: msg });
      }
    }

    // Response-Format:
    //   - Alle erfolgreich → 200 + { success: true, deleted: N }
    //   - Teilweise erfolgreich → 200 + { success: true, deleted, failed }
    //     (UI zeigt warning-Toast mit Counts + Fehlern)
    //   - Alle fehlgeschlagen → 500 + { success: false, deleted: 0, failed }
    //
    // Wichtig: deleted/failed arrays werden IMMER zurückgegeben, damit das
    // UI Single + Bulk + Partial einheitlich rendern kann.
    if (deleted.length === 0) {
      const erstesProblem = failed[0]?.reason ?? "Unbekannter Fehler";
      return NextResponse.json(
        {
          success: false,
          deleted: 0,
          deleted_ids: [],
          failed,
          error: `Bestellungen konnten nicht gelöscht werden: ${erstesProblem}`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      deleted: deleted.length,
      deleted_ids: deleted,
      failed,
    });
  } catch (err) {
    logError("verwerfen", "Unerwartete Exception", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: ERRORS.INTERNER_FEHLER }, { status: 500 });
  }
}
