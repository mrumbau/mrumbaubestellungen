/**
 * POST /api/cron/erinnerungen
 *
 * Tägliche Mahnung-Erinnerung für Bestellungen ohne Lieferschein nach X Tagen.
 *
 * F5.8 Fix: KI-Mails werden jetzt TATSÄCHLICH per SMTP versendet (vorher
 * nur generiert + im Response-Body zurückgegeben — die Mahnungen kamen also
 * nirgends an, der Workflow war halb-gebrochen).
 *
 * F5.11: Auth akzeptiert Bearer (CRON_SECRET) primär, Body-Secret-Fallback
 * bleibt für Make.com-Kompatibilität bis zum Cutover.
 *
 * Idempotenz: bestellungen.mahnung_am wird gesetzt; wenn jünger als
 * (interval × 0.8) Tage, wird die Mail nicht erneut gesendet.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { generiereErinnerungsmail } from "@/lib/openai";
import { sendeMahnungEmail } from "@/lib/email";
import { logError, logInfo } from "@/lib/logger";
import { safeCompare } from "@/lib/safe-compare";

const BodySchema = z.object({
  secret: z.string().optional(),
  tage: z.number().int().min(1).max(60).optional(),
}).passthrough();

function isAuthorized(request: NextRequest, body: { secret?: string }): boolean {
  // Bearer-Header zuerst (R5c-Style)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization") ?? "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    if (bearer && safeCompare(bearer, cronSecret)) return true;
  }
  // Fallback: Body-Secret (Make.com-Legacy)
  const makeSecret = process.env.MAKE_WEBHOOK_SECRET;
  if (makeSecret && body.secret && safeCompare(body.secret, makeSecret)) return true;
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(rawBody);
    const body = parsed.success ? parsed.data : { secret: undefined, tage: undefined };

    if (!isAuthorized(request, body)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const schwelleTage = body.tage ?? 5;
    const schwelleDatum = new Date(Date.now() - schwelleTage * 24 * 60 * 60 * 1000).toISOString();

    // F5.8/Idempotenz: Bestellungen die bereits eine Mahnung im aktuellen
    // Intervall bekommen haben, ausschließen. Neue Mahnung nur wenn die letzte
    // älter als 80% des Schwellwerts ist.
    const dedupTage = Math.max(1, Math.floor(schwelleTage * 0.8));
    const dedupSchwelle = new Date(Date.now() - dedupTage * 24 * 60 * 60 * 1000).toISOString();

    const { data: bestellungen } = await supabase
      .from("bestellungen")
      .select("id, bestellnummer, haendler_name, besteller_kuerzel, besteller_name, betrag, created_at, mahnung_am, mahnung_count")
      .eq("hat_lieferschein", false)
      .neq("bestellungsart", "subunternehmer")
      .neq("bestellungsart", "abo")
      .in("status", ["offen", "ls_fehlt"])
      .lt("created_at", schwelleDatum)
      .or(`mahnung_am.is.null,mahnung_am.lt.${dedupSchwelle}`)
      .order("created_at", { ascending: true });

    if (!bestellungen || bestellungen.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Keine Bestellungen mit fehlendem Lieferschein gefunden.",
        gesendet: 0,
      });
    }

    // Status auf ls_fehlt setzen wo nötig (für sichtbares UI-Signal)
    const lsFehltIds = bestellungen
      .filter((b) => b.besteller_kuerzel !== "UNBEKANNT")
      .map((b) => b.id);

    // F5.1: Status-Machine — Batch-Update validieren wir nicht via safeUpdateStatus
    // (wäre n+1 Round-Trips). Stattdessen nur Bestellungen wechseln deren aktueller
    // Status den Übergang erlaubt (offen/vollstaendig/abweichung → ls_fehlt).
    // Niemals freigegebene Bestellungen treffen.
    if (lsFehltIds.length > 0) {
      const { error: updateError } = await supabase
        .from("bestellungen")
        .update({ status: "ls_fehlt", updated_at: new Date().toISOString() })
        .in("id", lsFehltIds)
        .neq("status", "freigegeben");
      if (updateError) {
        logError("/api/cron/erinnerungen", "Batch-Update ls_fehlt fehlgeschlagen", updateError);
      }
    }

    // Gruppiere nach Besteller
    const bestellerGruppen = new Map<string, typeof bestellungen>();
    for (const b of bestellungen) {
      if (b.besteller_kuerzel === "UNBEKANNT") continue;
      if (!bestellerGruppen.has(b.besteller_kuerzel)) {
        bestellerGruppen.set(b.besteller_kuerzel, []);
      }
      bestellerGruppen.get(b.besteller_kuerzel)!.push(b);
    }

    let gesendet = 0;
    let fehlgeschlagen = 0;
    const versandResults: Array<{ kuerzel: string; email: string; bestellungen: number; success: boolean; error?: string }> = [];

    for (const [kuerzel, gruppe] of bestellerGruppen) {
      const { data: benutzer } = await supabase
        .from("benutzer_rollen")
        .select("email, name")
        .eq("kuerzel", kuerzel)
        .single();

      if (!benutzer) continue;

      const bestellDaten = gruppe.map((b) => ({
        bestellnummer: b.bestellnummer || "Ohne Nr.",
        haendler: b.haendler_name || "Unbekannt",
        besteller: b.besteller_name,
        tage_alt: Math.floor((Date.now() - new Date(b.created_at).getTime()) / (24 * 60 * 60 * 1000)),
        betrag: Number(b.betrag) || 0,
      }));

      let mailText: string;
      try {
        mailText = await generiereErinnerungsmail(bestellDaten);
      } catch (err) {
        logError("/api/cron/erinnerungen", `KI-Generation fehlgeschlagen für ${kuerzel}`, err);
        fehlgeschlagen++;
        continue;
      }

      const betreff = `Erinnerung: ${gruppe.length} Lieferschein${gruppe.length > 1 ? "e" : ""} fehlt noch`;
      const result = await sendeMahnungEmail({
        empfaengerEmail: benutzer.email,
        empfaengerName: benutzer.name,
        betreff,
        text: mailText,
      });

      versandResults.push({
        kuerzel,
        email: benutzer.email,
        bestellungen: gruppe.length,
        success: result.success,
        error: result.error,
      });

      if (result.success) {
        gesendet++;
        // Idempotenz-Marker setzen + count hochzählen
        const ids = gruppe.map((b) => b.id);
        for (const b of gruppe) {
          await supabase
            .from("bestellungen")
            .update({
              mahnung_am: new Date().toISOString(),
              mahnung_count: (b.mahnung_count ?? 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", b.id);
        }
        logInfo("/api/cron/erinnerungen", `Mahnung versendet an ${kuerzel}`, {
          email: benutzer.email,
          bestellungen: ids.length,
        });
      } else {
        fehlgeschlagen++;
        // SMTP-Fehler in webhook_logs für Diagnose
        await supabase.from("webhook_logs").insert({
          typ: "cron",
          status: "error",
          fehler_text: `Mahnung-Versand fehlgeschlagen an ${kuerzel} (${benutzer.email}): ${result.error}`,
        });
      }
    }

    await supabase.from("webhook_logs").insert({
      typ: "cron",
      status: gesendet > 0 ? "success" : "info",
      fehler_text: `Mahnung-Cron: ${gesendet} versendet, ${fehlgeschlagen} fehlgeschlagen`,
    });

    return NextResponse.json({
      success: true,
      gesendet,
      fehlgeschlagen,
      gesamt_kandidaten: bestellungen.length,
      details: versandResults,
    });
  } catch (err) {
    logError("/api/cron/erinnerungen", "Unerwarteter Fehler", err);
    try {
      const supabase = createServiceClient();
      await supabase.from("webhook_logs").insert({
        typ: "cron",
        status: "error",
        fehler_text: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    } catch { /* Log-Fehler nicht propagieren */ }

    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
