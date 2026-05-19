/**
 * Pre-Bestellungs-Phase: Filter + Reply-Action + Idempotenz (Schritte 2-3).
 *
 * Reihenfolge:
 *   1. Irrelevante Domain (außer bekannter Händler/SU)
 *   2. Blacklist (per Adresse oder Domain)
 *   3. Email-Reply-as-Action (gültiger [REF:<token>] + Action-Keyword → Status)
 *   4. 24h-Body-Hash-Idempotenz (re-Backfill-Bypass bei existing_bestellung_id)
 *   5. Betreff-Validierung (max 500 Zeichen, sonst throw)
 *
 * Liefert entweder `null` (Pipeline läuft normal weiter) oder einen Skip-/
 * Reply-Action-Response, der vom Orchestrator direkt zurückgegeben wird.
 *
 * 19.05.2026 (A2.1) — aus run.ts extrahiert. Verhalten unverändert.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logInfo } from "@/lib/logger";
import { isIrrelevantDomain } from "./mail-utils";
import { checkAndClaimIdempotency } from "./idempotency-check";
import { detectReplyAction, applyReplyAction } from "./reply-action";

export interface PreChecksInput {
  hatVorfilter: boolean;
  existing_bestellung_id: string | null | undefined;
  absenderAdresse: string;
  absenderDomain: string;
  email_absender: string;
  email_betreff: string;
  email_datum: string;
  email_text: string | undefined;
  email_body: string | undefined;
  anhaenge_count: number;
}

export type PreChecksResult =
  | null
  | {
      success: true;
      skipped?: boolean;
      deduplicated?: boolean;
      reason?: string;
      bestellung_id?: string;
    };

export async function runPreBestellungsChecks(
  supabase: SupabaseClient,
  input: PreChecksInput,
): Promise<PreChecksResult> {
  const {
    hatVorfilter,
    existing_bestellung_id,
    absenderAdresse,
    absenderDomain,
    email_absender,
    email_betreff,
    email_datum,
    email_text,
    email_body,
    anhaenge_count,
  } = input;

  // 2. Irrelevante Domains + Blacklist (nur ohne Vorfilter)
  if (!hatVorfilter) {
    if (isIrrelevantDomain(absenderDomain)) {
      const { data: bekannterHaendler } = await supabase
        .from("haendler")
        .select("id")
        .contains("email_absender", [absenderAdresse])
        .limit(1);
      const { data: bekannterSU } = await supabase
        .from("subunternehmer")
        .select("id")
        .contains("email_absender", [absenderAdresse])
        .limit(1);

      if ((!bekannterHaendler || bekannterHaendler.length === 0) &&
          (!bekannterSU || bekannterSU.length === 0)) {
        logInfo("webhook/email", `Irrelevante Domain: ${absenderDomain}`, { email_betreff });
        return { success: true, skipped: true, reason: "irrelevant_domain" };
      }
    }

    const { data: blacklist } = await supabase.from("email_blacklist").select("muster, typ");
    if (blacklist && blacklist.length > 0) {
      const istBlockiert = blacklist.some((bl) => {
        const muster = bl.muster.toLowerCase();
        if (bl.typ === "adresse") return absenderAdresse === muster;
        return absenderDomain === muster || absenderDomain.endsWith("." + muster);
      });
      if (istBlockiert) {
        return { success: true, skipped: true, reason: "blacklisted" };
      }
    }
  }

  // 2.5 Welle 5 O7 — Email-Reply-as-Action.
  // Vor dem Idempotency-Check, damit Reply-Mails nicht als 24h-Body-Duplikate
  // verworfen werden und auch keine PDF-Pipeline durchlaufen. Wenn die Mail einen
  // gültigen [REF:<token>] + Action-Keyword enthält → Status-Wechsel + return.
  if (!existing_bestellung_id) {
    const replyBody = email_text || email_body || "";
    if (replyBody) {
      const replyMatch = await detectReplyAction(supabase, replyBody);
      if (replyMatch) {
        const result = await applyReplyAction(supabase, replyMatch, absenderAdresse);
        if (result.success) {
          logInfo("webhook/email", "Email-Reply-Action ausgeführt", {
            bestellung_id: replyMatch.bestellungId,
            action: replyMatch.action,
            sender: absenderAdresse,
            new_status: result.newStatus,
            skipped: result.skipped,
          });
          return {
            success: true,
            skipped: true,
            reason: result.skipped
              ? `reply_action_${replyMatch.action}_${result.reason ?? "skipped"}`
              : `reply_action_${replyMatch.action}`,
            bestellung_id: replyMatch.bestellungId,
          };
        }
        // Bei !success und reason=sender_unknown / rolle_unzulaessig: weiter
        // mit normaler Pipeline (z.B. wenn ein anderer Empfänger geantwortet hat).
        logInfo("webhook/email", "Email-Reply-Action nicht ausgeführt", {
          bestellung_id: replyMatch.bestellungId,
          action: replyMatch.action,
          reason: result.reason,
        });
      }
    }
  }

  // 3. Idempotenz (24h-Body-Hash)
  // Re-Backfill-Bypass: bei explizitem existing_bestellung_id-Hint überspringen
  // wir den Hash-Check — wir wollen die Mail bewusst neu verarbeiten und
  // an die existierende Bestellung anhängen. Sonst würde der Hash-Lock aus
  // dem ursprünglichen Run die zweite Verarbeitung als "duplicate" abwürgen.
  if (!existing_bestellung_id) {
    const idem = await checkAndClaimIdempotency(supabase, {
      email_absender,
      email_betreff,
      email_datum,
      email_body: email_text || email_body || "",
      anhaenge_count,
    });
    if (idem.isDuplicate) {
      return { success: true, deduplicated: true };
    }
  } else {
    logInfo("webhook/email", "24h-Hash-Idempotenz übersprungen wegen existing_bestellung_id (Re-Backfill)", {
      existing_bestellung_id,
    });
  }

  // 4. Betreff-Validierung
  if (email_betreff && email_betreff.length > 500) {
    throw new Error("Betreff zu lang");
  }

  return null;
}
