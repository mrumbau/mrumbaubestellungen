/**
 * R5c — Idempotenz-Check (24h-Fenster)
 *
 * Aus webhook/email/route.ts (Z. 194-224) extrahiert.
 *
 * F3.F3 Fix: Hash über vollen Body statt nur 200 chars. Bei Mails mit
 * gleichem Subject/Absender/Datum aber unterschiedlichem Inhalt (HTML vs
 * Plain-Text Variante derselben Mail) hat der alte 200-char-Hash zu
 * False-Positive-Dedup geführt. Jetzt: bis zu 5000 chars + Body-Länge im
 * Hash-Input.
 *
 * 06.05.2026 — Subject-Normalisierung: Re:/Fwd:/Aw:/Antw:-Prefixes und
 * unterschiedliche Quote-Varianten (' " ‚ ' ' " " ' ›) werden vor dem Hash
 * angeglichen. Damit erkennen wir Reply-Duplikate und Plain-vs-HTML-Quote-
 * Varianten als identische Mail (verhindert die Hamdi-RE012- und
 * Amazon-Quote-Variant-Duplikate).
 *
 * Fail-open: Bei DB-Fehler trotzdem verarbeiten (lieber Duplikat als Daten-
 * verlust). Schreib-Fehler werden geloggt.
 */

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logError } from "@/lib/logger";

/**
 * Normalisiert Subject + Body so, dass Reply-Prefixe und Quote-Varianten
 * keine False-Positive-Unterschiede erzeugen. Idempotent (kann mehrfach
 * angewendet werden).
 */
export function normalizeForIdempotency(text: string): string {
  if (!text) return "";
  let s = text;
  // Reply/Forward-Prefixe iterativ strippen ("Re: Re: Aw: Original")
  // matcht: Re:, RE:, Re :, Aw:, AW:, Antw:, Antwort:, Fwd:, FW:, Wg:, WG:
  for (let i = 0; i < 8; i++) {
    const next = s.replace(/^\s*(re|aw|antw(?:ort)?|fwd?|wg)\s*:\s*/i, "");
    if (next === s) break;
    s = next;
  }
  // Alle Quote-/Apostroph-Varianten auf gerade " vereinheitlichen
  s = s
    .replace(/[‘’‚‛‹›`´']/g, '"')
    .replace(/[“”„‟«»]/g, '"');
  // Whitespace kollabieren
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  return s;
}

export interface IdempotencyInput {
  email_absender: string | null | undefined;
  email_betreff: string | null | undefined;
  email_datum: string | null | undefined;
  email_body: string | null | undefined;
  anhaenge_count: number;
}

export interface IdempotencyResult {
  /** Hash für die `bestellnummer`-Spalte des webhook_logs-Eintrags. */
  hash: string;
  /** True = Mail wurde innerhalb der letzten 24h schon verarbeitet. */
  isDuplicate: boolean;
}

/**
 * Berechnet den Idempotency-Hash und prüft, ob in den letzten 24h schon
 * ein webhook_log mit dem Hash existiert. Bei Treffer → isDuplicate=true.
 *
 * Schreibt einen "processing"-Eintrag in webhook_logs (Lock-Indikator).
 *
 * Bei DB-Fehler (Idempotency-Check ODER Insert): fail-open (isDuplicate=false,
 * Mail wird verarbeitet).
 */
export async function checkAndClaimIdempotency(
  supabase: SupabaseClient,
  input: IdempotencyInput,
): Promise<IdempotencyResult> {
  // F3.F3: Body-Head von 200 → 5000 chars erweitert. Bei gleichem
  // Subject/Datum/Absender erkennt der Hash so unterschiedliche Body-Varianten.
  // Hash-Input enthält auch Body-Länge zur weiteren Differenzierung.
  // 06.05.2026: Subject + Body normalisiert (Reply-Prefix, Quote-Varianten).
  const fullBody = input.email_body || "";
  const bodyHead = normalizeForIdempotency(fullBody.slice(0, 5000));
  const bodyLen = String(fullBody.length);
  const subjectNorm = normalizeForIdempotency(input.email_betreff || "");
  const absenderNorm = (input.email_absender || "").trim().toLowerCase();
  const anhaengeSignatur = `n${input.anhaenge_count}`;

  const idempotencyKey =
    `${absenderNorm}|${subjectNorm}|${input.email_datum || ""}|${bodyHead}|${bodyLen}|${anhaengeSignatur}`;
  const hash = createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 64);

  try {
    const { data: existing, error: idempotencyError } = await supabase
      .from("webhook_logs")
      .select("id")
      .eq("typ", "email")
      .eq("bestellnummer", hash)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1);

    if (idempotencyError) {
      logError("webhook/email/idempotency", "DB-Fehler (fail-open)", idempotencyError);
      return { hash, isDuplicate: false };
    }

    if (existing && existing.length > 0) {
      return { hash, isDuplicate: true };
    }

    // Lock setzen — bei parallel laufenden Workers verhindert das Doppelt-Verarbeitung
    await supabase.from("webhook_logs").insert({
      typ: "email",
      status: "processing",
      bestellnummer: hash,
    });
  } catch (idempotencyErr) {
    logError("webhook/email/idempotency", "Fehler (fail-open)", idempotencyErr);
  }

  return { hash, isDuplicate: false };
}
