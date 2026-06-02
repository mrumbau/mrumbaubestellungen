/**
 * Welle 5 O7 — Email-Reply-as-Action.
 * 06.05.2026
 *
 * Erkennt eingehende Mails, die eine Antwort auf eine Mahnungs-/Erinnerungs-Mail
 * darstellen, anhand des Reply-Token-Patterns `[REF:<uuid>]` im Body. Wenn die
 * Mail einen gültigen Token + ein Action-Keyword enthält, wird der Status der
 * Bestellung gewechselt — die Pipeline stoppt vor der PDF-Analyse.
 *
 * Sicherheits-Modell:
 *  - Token ist UUID, persistent pro Bestellung in bestellungen.reply_token
 *  - Token wird beim ersten Versand einer Mahnung generiert (nicht im Voraus)
 *  - Sender-Email muss zu einem Besteller (Material/Subunternehmer-Konto) oder
 *    Buchhaltungs-User gehören (sonst skip)
 *  - Action-Keyword muss am Anfang einer Zeile stehen (Reply-Quote-Resistance)
 *  - Bei "FREIGEBEN" muss die Bestellung mind. eine Rechnung haben
 *  - Bei "BEZAHLT" muss die Bestellung freigegeben sein
 *  - Mehrfach-Trigger werden idempotent behandelt (Status-Check vor Update)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logError, logInfo } from "@/lib/logger";

const ROUTE = "pipeline/reply-action";

export const TOKEN_RE = /\[REF:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/i;

export type ReplyActionType = "freigeben" | "bezahlt" | "ablehnen" | "uebernehmen";

export const ACTION_KEYWORDS: Record<ReplyActionType, RegExp[]> = {
  // Match nur am Anfang einer Zeile (gestrippter Reply-Header) für Quote-Resistance
  freigeben: [
    /^\s*(freigeben|freigabe|freigegeben|ja|ok|bestätig(e|t|ung)|bestaetig(e|t|ung)|approved?)\b/im,
  ],
  bezahlt: [
    /^\s*(bezahlt|gezahlt|paid|überwiesen|ueberwiesen)\b/im,
  ],
  ablehnen: [
    /^\s*(ablehnen|abgelehnt|nein|reject(ed)?|stornieren|rejected)\b/im,
  ],
  // 02.06.2026 (Pool Phase 5) — UEBERNEHMEN signalisiert Pool-Claim. Für den
  // Daily-Digest, der UNBEKANNT-Bestellungen auflistet, antwortet ein Besteller
  // mit "UEBERNEHMEN [REF:xxx]" → besteller_kuerzel wird auf den Sender gesetzt.
  // Keine Freigabe, nur Owner-Wechsel.
  uebernehmen: [
    /^\s*(übernehmen|uebernehmen|claim|nehme|nehmen|ich mach(e)?|machen wir)\b/im,
  ],
};

export interface ReplyActionMatch {
  bestellungId: string;
  action: ReplyActionType;
  matchedKeyword: string;
}

/**
 * Detektiert in einem Mail-Body Reply-Token + Action-Keyword.
 * Returns null wenn kein Token oder kein Keyword erkannt.
 */
export async function detectReplyAction(
  supabase: SupabaseClient,
  body: string,
): Promise<ReplyActionMatch | null> {
  if (!body) return null;

  const tokenMatch = body.match(TOKEN_RE);
  if (!tokenMatch) return null;

  const token = tokenMatch[1].toLowerCase();

  // Token gegen DB matchen. 02.06.2026 (Pool Phase 5) — auch
  // reply_token_used_at mitselektieren: Defense gegen Hijacking, indem alte
  // Tokens nach erster Action invalidiert werden. Wir loggen den Fund
  // trotzdem (für Diagnose), brechen aber ab bevor wir die Action triggern.
  const { data: bestellung, error } = await supabase
    .from("bestellungen")
    .select("id, reply_token_used_at")
    .eq("reply_token", token)
    .maybeSingle();

  if (error || !bestellung) {
    logInfo(ROUTE, "Reply-Token unbekannt — ignoriert", { token: token.slice(0, 8) + "…" });
    return null;
  }

  if ((bestellung as { reply_token_used_at?: string | null }).reply_token_used_at) {
    logInfo(ROUTE, "Reply-Token bereits verwendet — ignoriert (Replay-Schutz)", {
      bestellung_id: bestellung.id,
    });
    return null;
  }

  // Body ohne Quote-Block prüfen (alles vor der ersten Reply-Header-Zeile,
  // typische Marker: "Am ...", "On ...", "> ", "----- Original-Nachricht -----")
  const cleanBody = stripQuotedReply(body);
  const action = findActionKeyword(cleanBody);
  if (action) {
    return { bestellungId: bestellung.id, ...action };
  }

  logInfo(ROUTE, "Reply-Token erkannt aber kein Action-Keyword gefunden", {
    bestellung_id: bestellung.id,
  });
  return null;
}

/**
 * Pure-Helper: findet das erste Action-Keyword in einem (bereits gestrippten)
 * Body. Exportiert für Vitest-Tests.
 */
export function findActionKeyword(
  cleanBody: string,
): { action: ReplyActionType; matchedKeyword: string } | null {
  for (const [action, patterns] of Object.entries(ACTION_KEYWORDS)) {
    for (const pattern of patterns) {
      const m = cleanBody.match(pattern);
      if (m) {
        return {
          action: action as ReplyActionType,
          matchedKeyword: m[1] ?? m[0],
        };
      }
    }
  }
  return null;
}

/**
 * Entfernt den zitierten Original-Mail-Body aus einem Reply, damit Action-
 * Keywords im ursprünglichen Mail-Footer nicht fälschlich getriggert werden.
 *
 * Heuristisch — funktioniert für Outlook + Apple Mail + Gmail-Format.
 * Exportiert für Vitest-Tests.
 */
export function stripQuotedReply(body: string): string {
  // Common reply markers (insensitive zum Whitespace, Multi-Line-Anker)
  const markers: RegExp[] = [
    /\n\s*-{2,}\s*Original-Nachricht\s*-{2,}/i,
    /\n\s*-{2,}\s*Original Message\s*-{2,}/i,
    /\n\s*Am\s+[^\n]{0,80}schrieb\s/i, // "Am Mi., 6. Mai 2026 um 12:00 Uhr schrieb…"
    /\n\s*On\s+[^\n]{0,80}wrote:/i, // English-Apple-Mail
    /\n\s*Von:\s/i, // Outlook
    /\n\s*From:\s.*\n\s*Sent:\s/i,
    /\n>\s/, // Plain quote-prefix
  ];

  let cutoff = body.length;
  for (const m of markers) {
    const match = body.match(m);
    if (match && match.index !== undefined && match.index < cutoff) {
      cutoff = match.index;
    }
  }
  return body.slice(0, cutoff);
}

/**
 * Setzt den Reply-Token auf einer Bestellung — idempotent.
 * Wird beim ersten Versand einer Mahnung aufgerufen.
 */
export async function ensureReplyToken(
  supabase: SupabaseClient,
  bestellungId: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("bestellungen")
    .select("reply_token")
    .eq("id", bestellungId)
    .maybeSingle();

  const existingToken = (existing as { reply_token?: string } | null)?.reply_token;
  if (existingToken) return existingToken;

  // Generate UUID v4 (Web Crypto API ist auf Node 18+ verfügbar)
  const newToken = crypto.randomUUID();
  const { error } = await supabase
    .from("bestellungen")
    .update({ reply_token: newToken })
    .eq("id", bestellungId);

  if (error) {
    logError(ROUTE, "Reply-Token setzen fehlgeschlagen", error);
    return null;
  }

  return newToken;
}

/**
 * Führt eine Reply-Action aus. Idempotent — wenn der Status bereits passt,
 * wird kein Update durchgeführt aber success geloggt.
 *
 * Validation:
 *  - "freigeben" benötigt hat_rechnung=true
 *  - "bezahlt" benötigt status='freigegeben'
 *  - "ablehnen" toggelt status auf 'abweichung' (kein Audit-Trigger-Konflikt)
 *
 * Sender-Verifikation:
 *  - sender_email muss zu einer benutzer_rollen.email gehören
 *  - Bei "freigeben": Sender muss ein Besteller oder Admin sein
 *  - Bei "bezahlt": Sender muss Buchhaltung oder Admin sein
 */
export interface ApplyReplyResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  newStatus?: string;
}

export async function applyReplyAction(
  supabase: SupabaseClient,
  match: ReplyActionMatch,
  senderEmail: string,
): Promise<ApplyReplyResult> {
  const { bestellungId, action, matchedKeyword } = match;

  // 1. Sender verifizieren — muss bekannter Benutzer sein
  const { data: senderProfil } = await supabase
    .from("benutzer_rollen")
    .select("kuerzel, name, rolle, email")
    .eq("email", senderEmail.toLowerCase())
    .maybeSingle();

  if (!senderProfil) {
    return {
      success: false,
      skipped: true,
      reason: "sender_unknown",
    };
  }

  // 2. Action-spezifische Rollen-Validation
  if (action === "freigeben" && senderProfil.rolle !== "besteller" && senderProfil.rolle !== "admin") {
    return { success: false, skipped: true, reason: "rolle_unzulaessig" };
  }
  if (action === "bezahlt" && senderProfil.rolle !== "buchhaltung" && senderProfil.rolle !== "admin") {
    return { success: false, skipped: true, reason: "rolle_unzulaessig" };
  }
  // 02.06.2026 (Pool Phase 5) — UEBERNEHMEN braucht besteller- oder admin-Rolle.
  if (action === "uebernehmen" && senderProfil.rolle !== "besteller" && senderProfil.rolle !== "admin") {
    return { success: false, skipped: true, reason: "rolle_unzulaessig" };
  }

  // 3. Bestellung laden für Action-Validation
  const { data: bestellung } = await supabase
    .from("bestellungen")
    .select("id, status, hat_rechnung, bezahlt_am, besteller_kuerzel, bestellungsart")
    .eq("id", bestellungId)
    .maybeSingle();

  if (!bestellung) {
    return { success: false, skipped: true, reason: "bestellung_nicht_gefunden" };
  }

  // Helper: Token nach jeder erfolgreichen Action invalidieren.
  async function invalidateToken() {
    await supabase
      .from("bestellungen")
      .update({ reply_token_used_at: new Date().toISOString() })
      .eq("id", bestellungId);
  }

  // 4. Action ausführen
  if (action === "freigeben") {
    if (!bestellung.hat_rechnung) {
      return { success: false, skipped: true, reason: "keine_rechnung" };
    }
    if (bestellung.status === "freigegeben") {
      return { success: true, skipped: true, reason: "bereits_freigegeben" };
    }

    // Nutze die existierende RPC, die auch Audit-Logs schreibt
    const { error: rpcErr } = await supabase.rpc("freigeben_bestellung", {
      p_bestellung_id: bestellungId,
      p_kuerzel: senderProfil.kuerzel,
      p_name: senderProfil.name,
      p_kommentar: `Per E-Mail-Reply (${matchedKeyword})`,
    });
    if (rpcErr) {
      logError(ROUTE, "freigeben_bestellung-RPC fehlgeschlagen", rpcErr);
      return { success: false, reason: rpcErr.message };
    }
    await invalidateToken();
    logInfo(ROUTE, "Bestellung via Email-Reply freigegeben", {
      bestellung_id: bestellungId,
      sender: senderProfil.kuerzel,
    });
    return { success: true, newStatus: "freigegeben" };
  }

  if (action === "bezahlt") {
    if (bestellung.status !== "freigegeben") {
      return { success: false, skipped: true, reason: "nicht_freigegeben" };
    }
    if (bestellung.bezahlt_am) {
      return { success: true, skipped: true, reason: "bereits_bezahlt" };
    }
    const { error: updErr } = await supabase
      .from("bestellungen")
      .update({
        bezahlt_am: new Date().toISOString(),
        bezahlt_von: senderProfil.kuerzel,
      })
      .eq("id", bestellungId);
    if (updErr) {
      logError(ROUTE, "Bezahlt-Update fehlgeschlagen", updErr);
      return { success: false, reason: updErr.message };
    }
    // Audit-Event manuell loggen (kein Trigger auf bezahlt_am)
    await supabase.rpc("log_event", {
      p_actor: senderProfil.kuerzel,
      p_entity_id: bestellungId,
      p_entity_type: "bestellung",
      p_event_type: "bestellung_bezahlt",
      p_payload: { method: "email_reply", keyword: matchedKeyword },
    });
    await invalidateToken();
    logInfo(ROUTE, "Bestellung via Email-Reply als bezahlt markiert", {
      bestellung_id: bestellungId,
      sender: senderProfil.kuerzel,
    });
    return { success: true, newStatus: "bezahlt" };
  }

  if (action === "ablehnen") {
    if (bestellung.status === "freigegeben") {
      return { success: false, skipped: true, reason: "bereits_freigegeben_kein_ablehnen" };
    }
    if (bestellung.status === "abweichung") {
      return { success: true, skipped: true, reason: "bereits_abgewiesen" };
    }
    const { error: updErr } = await supabase
      .from("bestellungen")
      .update({ status: "abweichung" })
      .eq("id", bestellungId);
    if (updErr) {
      logError(ROUTE, "Ablehnen-Update fehlgeschlagen", updErr);
      return { success: false, reason: updErr.message };
    }
    await supabase.rpc("log_event", {
      p_actor: senderProfil.kuerzel,
      p_entity_id: bestellungId,
      p_entity_type: "bestellung",
      p_event_type: "bestellung_abgelehnt",
      p_payload: { method: "email_reply", keyword: matchedKeyword },
    });
    await invalidateToken();
    logInfo(ROUTE, "Bestellung via Email-Reply abgelehnt", {
      bestellung_id: bestellungId,
      sender: senderProfil.kuerzel,
    });
    return { success: true, newStatus: "abweichung" };
  }

  // 02.06.2026 (Pool Phase 5) — UEBERNEHMEN: Pool-Claim via E-Mail-Reply.
  // Setzt besteller_kuerzel auf den Sender, race-safe via WHERE-Clause.
  // Bei bereits-zugeordneter Bestellung silent skip (Token-Invalidierung
  // verhindert ohnehin Replay).
  if (action === "uebernehmen") {
    const b = bestellung as {
      besteller_kuerzel: string | null;
      bestellungsart: string | null;
      status: string | null;
    };
    if (b.bestellungsart !== "material") {
      return { success: false, skipped: true, reason: "nicht_pool_faehig" };
    }
    if (b.status === "freigegeben") {
      return { success: false, skipped: true, reason: "bereits_freigegeben" };
    }
    if (b.besteller_kuerzel && b.besteller_kuerzel !== "UNBEKANNT") {
      return {
        success: true,
        skipped: true,
        reason: "bereits_uebernommen",
        newStatus: b.status ?? undefined,
      };
    }

    // Race-safe Claim: nur wenn besteller_kuerzel weiterhin 'UNBEKANNT' ist.
    const { data: updRow, error: updErr } = await supabase
      .from("bestellungen")
      .update({
        besteller_kuerzel: senderProfil.kuerzel,
        besteller_name: senderProfil.name,
        zuordnung_methode: "pool_claim_via_reply",
        updated_at: new Date().toISOString(),
      })
      .eq("id", bestellungId)
      .eq("besteller_kuerzel", "UNBEKANNT")
      .select("id")
      .maybeSingle();

    if (updErr) {
      logError(ROUTE, "Pool-Claim via Reply fehlgeschlagen", updErr);
      return { success: false, reason: updErr.message };
    }
    if (!updRow) {
      // Race verloren — andere User hat zwischen Check und UPDATE geclaimt.
      return { success: true, skipped: true, reason: "race_lost" };
    }

    await supabase.rpc("log_event", {
      p_actor: senderProfil.kuerzel,
      p_entity_id: bestellungId,
      p_entity_type: "bestellung",
      p_event_type: "pool_claim",
      p_payload: {
        method: "email_reply",
        keyword: matchedKeyword,
        claimed_by_kuerzel: senderProfil.kuerzel,
        claimed_by_name: senderProfil.name,
        previous_owner: "UNBEKANNT",
      },
    });
    await invalidateToken();
    logInfo(ROUTE, "Bestellung via Email-Reply aus Pool übernommen", {
      bestellung_id: bestellungId,
      sender: senderProfil.kuerzel,
    });
    return { success: true, newStatus: b.status ?? undefined };
  }

  return { success: false, reason: "unknown_action" };
}
