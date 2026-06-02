/**
 * POST /api/cron/erinnerungen-pool
 *
 * Pool-Phase-5 (02.06.2026) — Daily-Digest an alle aktiven Besteller mit der
 * Liste der UNBEKANNT-Material-Bestellungen (Pool). Pro Bestellung kommt ein
 * Reply-Token-Footer mit `UEBERNEHMEN [REF:xxx]` — der erste Besteller der
 * antwortet, claimt die Bestellung. Token wird nach Action invalidiert
 * (Hijacking-Schutz).
 *
 * Architektur:
 *   - pg_cron-Job `erinnerungen-pool` (05:45 UTC = 07:45 CEST) triggert
 *     diese Route via Vault-Secret + Bearer-Header.
 *   - Pool-Items = besteller_kuerzel='UNBEKANNT' + bestellungsart='material' +
 *     status != 'freigegeben' + älter als POOL_AGE_TAGE (Default 1 Tag).
 *   - Empfänger = alle aktiven Besteller-Rollen (admin + besteller — buchhaltung
 *     ausgenommen, sie ist kein gültiger Pool-Picker).
 *   - Idempotenz: pro Tag max 1 Digest pro Empfänger. Bei N+1 Tagen
 *     Pool-Bestand ohne neue Items wird die Mail trotzdem täglich versendet
 *     (sozialer Druck) — Limit max 1× pro Tag verhindert Spam.
 *
 * Mail-Format (Plain-Text):
 *   Betreff: "[Pool] X offene Bestellungen — wer übernimmt?"
 *   Body: Liste der Bestellungen + Vorschlag-Kürzel + Reply-Footer mit
 *   UEBERNEHMEN-Tokens pro Bestellung.
 *
 * Auth: identisch zu erinnerungen-Route — Bearer CRON_SECRET primär,
 * Body-Secret als Make.com-Fallback.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase";
import { sendeMahnungEmail } from "@/lib/email";
import { logError, logInfo } from "@/lib/logger";
import { safeCompare } from "@/lib/safe-compare";
import { ensureReplyToken } from "@/lib/email-pipeline/pipeline/reply-action";

const BodySchema = z
  .object({
    secret: z.string().optional(),
    /** Min-Alter der Pool-Bestellungen in Tagen (Default 1). */
    age_tage: z.number().int().min(0).max(30).optional(),
  })
  .passthrough();

function isAuthorized(request: NextRequest, body: { secret?: string }): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization") ?? "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    if (bearer && safeCompare(bearer, cronSecret)) return true;
  }
  const makeSecret = process.env.MAKE_WEBHOOK_SECRET;
  if (makeSecret && body.secret && safeCompare(body.secret, makeSecret)) return true;
  return false;
}

const DIGEST_DEDUP_HOURS = 20; // pro Empfänger max 1× pro Tag

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(rawBody);
    const body = parsed.success ? parsed.data : { secret: undefined, age_tage: undefined };

    if (!isAuthorized(request, body)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const ageTage = body.age_tage ?? 1;
    const ageSchwelle = new Date(Date.now() - ageTage * 24 * 60 * 60 * 1000).toISOString();

    // 1. Pool-Items laden
    const { data: poolItems } = await supabase
      .from("bestellungen")
      .select(
        "id, bestellnummer, haendler_name, betrag, created_at, bestelldatum, vorschlag_kuerzel, vorschlag_konfidenz, mahnung_count",
      )
      .eq("besteller_kuerzel", "UNBEKANNT")
      .eq("bestellungsart", "material")
      .neq("status", "freigegeben")
      .lt("created_at", ageSchwelle)
      .order("created_at", { ascending: true });

    if (!poolItems || poolItems.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Pool ist leer — keine Digest-Mails versendet.",
        gesendet: 0,
      });
    }

    // 2. Empfänger laden (aktive Besteller + Admin)
    const { data: empfaengerListe } = await supabase
      .from("benutzer_rollen")
      .select("kuerzel, name, email, rolle")
      .in("rolle", ["besteller", "admin"])
      .order("name");

    if (!empfaengerListe || empfaengerListe.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Keine Empfänger konfiguriert.",
        gesendet: 0,
      });
    }

    // 3. Dedup-Schwelle prüfen über webhook_logs.fehler_text-Marker.
    // Wir setzen einen pool-digest-Marker pro Empfänger; wenn jüngster Marker
    // weniger als DIGEST_DEDUP_HOURS alt ist, skip diesen Empfänger.
    const dedupSchwelle = new Date(
      Date.now() - DIGEST_DEDUP_HOURS * 60 * 60 * 1000,
    ).toISOString();
    const { data: recentDigests } = await supabase
      .from("webhook_logs")
      .select("fehler_text, created_at")
      .eq("typ", "cron")
      .ilike("fehler_text", "Pool-Digest versendet an %")
      .gte("created_at", dedupSchwelle);

    const recentEmpfaengerKuerzel = new Set<string>();
    for (const log of recentDigests ?? []) {
      const m = (log.fehler_text ?? "").match(/Pool-Digest versendet an ([A-Z0-9]+)/);
      if (m) recentEmpfaengerKuerzel.add(m[1]);
    }

    // 4. Reply-Tokens pro Pool-Item generieren
    const itemsMitToken: Array<{
      bestellung_id: string;
      label: string;
      haendler: string;
      betrag: number;
      tage_alt: number;
      vorschlag: string | null;
      token: string;
    }> = [];
    for (const item of poolItems) {
      const token = await ensureReplyToken(supabase, item.id);
      if (!token) continue;
      const tageAlt = Math.floor(
        (Date.now() - new Date(item.bestelldatum ?? item.created_at).getTime()) /
          (24 * 60 * 60 * 1000),
      );
      itemsMitToken.push({
        bestellung_id: item.id,
        label: item.bestellnummer || `ID ${item.id.slice(0, 8)}`,
        haendler: item.haendler_name || "Unbekannter Händler",
        betrag: Number(item.betrag) || 0,
        tage_alt: tageAlt,
        vorschlag:
          item.vorschlag_kuerzel && item.vorschlag_kuerzel !== "UNBEKANNT"
            ? item.vorschlag_kuerzel
            : null,
        token,
      });
    }

    if (itemsMitToken.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Keine Pool-Items mit gültigem Token — keine Digest versendet.",
        gesendet: 0,
      });
    }

    // 5. Mail-Body bauen (gleicher Text für alle Empfänger).
    const bodyZeilen: string[] = [];
    bodyZeilen.push("Hallo,");
    bodyZeilen.push("");
    bodyZeilen.push(
      `im Pool warten ${itemsMitToken.length} Material-Bestellung${itemsMitToken.length === 1 ? "" : "en"} auf einen Besteller.`,
    );
    bodyZeilen.push(
      "Bitte einer von euch übernimmt sie — entweder hier im System oder direkt per Antwort auf diese Mail.",
    );
    bodyZeilen.push("");
    bodyZeilen.push("──────────────────────────────────────────────");

    for (const it of itemsMitToken) {
      const vorschlagText = it.vorschlag ? ` · Vorschlag: ${it.vorschlag}` : "";
      const betragText = it.betrag > 0 ? ` · ${it.betrag.toFixed(2)} €` : "";
      bodyZeilen.push(
        `• ${it.label} — ${it.haendler}${betragText} · seit ${it.tage_alt} Tag${it.tage_alt === 1 ? "" : "en"}${vorschlagText}`,
      );
      bodyZeilen.push(`    UEBERNEHMEN [REF:${it.token}]`);
    }

    bodyZeilen.push("──────────────────────────────────────────────");
    bodyZeilen.push("");
    bodyZeilen.push("Antwort-Aktionen (per Mail-Reply möglich):");
    bodyZeilen.push(
      "Antworte auf diese Mail und schreibe vor dem entsprechenden Token z.B.",
    );
    bodyZeilen.push("    UEBERNEHMEN [REF:…]   – Bestellung als Owner übernehmen");
    bodyZeilen.push("    NEIN [REF:…]          – Bestellung als problematisch markieren");
    bodyZeilen.push("");
    bodyZeilen.push("Der zuerst antwortende Besteller bekommt die Bestellung zugewiesen.");
    bodyZeilen.push("Nach der ersten Antwort wird der Token deaktiviert.");
    bodyZeilen.push("");
    bodyZeilen.push("Direkt im System: https://cloud.mrumbau.de/bestellungen?view=pool");

    const mailText = bodyZeilen.join("\n");
    const betreff = `[Pool] ${itemsMitToken.length} offene Bestellung${itemsMitToken.length === 1 ? "" : "en"} — wer übernimmt?`;

    // 6. Pro Empfänger versenden (mit Dedup)
    let gesendet = 0;
    let geskipped = 0;
    let fehlgeschlagen = 0;
    const versandResults: Array<{
      kuerzel: string;
      email: string;
      success: boolean;
      skipped?: boolean;
      error?: string;
    }> = [];

    for (const empfaenger of empfaengerListe) {
      if (recentEmpfaengerKuerzel.has(empfaenger.kuerzel)) {
        geskipped++;
        versandResults.push({
          kuerzel: empfaenger.kuerzel,
          email: empfaenger.email,
          success: true,
          skipped: true,
        });
        continue;
      }

      const result = await sendeMahnungEmail({
        empfaengerEmail: empfaenger.email,
        empfaengerName: empfaenger.name,
        betreff,
        text: mailText,
      });

      versandResults.push({
        kuerzel: empfaenger.kuerzel,
        email: empfaenger.email,
        success: result.success,
        error: result.error,
      });

      if (result.success) {
        gesendet++;
        await supabase.from("webhook_logs").insert({
          typ: "cron",
          status: "success",
          fehler_text: `Pool-Digest versendet an ${empfaenger.kuerzel} (${empfaenger.email}): ${itemsMitToken.length} Items`,
        });
        logInfo("/api/cron/erinnerungen-pool", `Pool-Digest versendet an ${empfaenger.kuerzel}`, {
          email: empfaenger.email,
          items: itemsMitToken.length,
        });
      } else {
        fehlgeschlagen++;
        await supabase.from("webhook_logs").insert({
          typ: "cron",
          status: "error",
          fehler_text: `Pool-Digest fehlgeschlagen an ${empfaenger.kuerzel} (${empfaenger.email}): ${result.error}`,
        });
      }
    }

    // 7. mahnung_count pro Item hochzählen (nur wenn mindestens eine Mail
    // versendet wurde — sonst kein Tracking-Effekt).
    if (gesendet > 0) {
      for (const it of itemsMitToken) {
        await supabase
          .from("bestellungen")
          .update({
            mahnung_am: new Date().toISOString(),
            mahnung_count:
              (poolItems.find((p) => p.id === it.bestellung_id)?.mahnung_count ?? 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", it.bestellung_id);
      }
    }

    return NextResponse.json({
      success: true,
      gesendet,
      geskipped,
      fehlgeschlagen,
      gesamt_empfaenger: empfaengerListe.length,
      pool_items: itemsMitToken.length,
      details: versandResults,
    });
  } catch (err) {
    logError("/api/cron/erinnerungen-pool", "Unerwarteter Fehler", err);
    try {
      const supabase = createServiceClient();
      await supabase.from("webhook_logs").insert({
        typ: "cron",
        status: "error",
        fehler_text:
          "Pool-Digest-Cron: " + (err instanceof Error ? err.message : "Unbekannter Fehler"),
      });
    } catch {
      /* Log-Fehler nicht propagieren */
    }
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
