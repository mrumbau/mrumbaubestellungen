// CardScan — Daily Vision-Quota
//
// R2/F7.2: Hard-Cap pro User pro Tag für Google-Vision-Calls.
// 100 Calls × ~$0.0015 = ~$0.15/User/Tag. Bei 5 aktiven Usern = max ~$0.75/Tag,
// also ~$22/Monat absolutes Maximum auch bei Misuse oder Bug.
//
// Bei Quota-Query-Fehler: fail-open (User wird nicht geblockt). Andernfalls
// würde ein DB-Outage CardScan komplett lahmlegen — das wollen wir nicht.

import { createServiceClient } from "@/lib/supabase";
import { logError, logInfo } from "@/lib/logger";

const ROUTE_TAG = "cardscan/vision-quota";

export const DAILY_VISION_CAP_PER_USER = 100;

export interface QuotaCheckResult {
  allowed: boolean;
  used: number;
  cap: number;
  /** True wenn DB-Fehler den Check umgangen hat (fail-open). */
  bypassed?: boolean;
}

export async function checkVisionDailyQuota(userId: string): Promise<QuotaCheckResult> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  try {
    const supabase = createServiceClient();
    const { count, error } = await supabase
      .from("cardscan_captures")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("source_type", "image")
      .gte("created_at", today.toISOString());

    if (error) {
      logError(ROUTE_TAG, "Quota-Query fehlgeschlagen — fail-open", error);
      return { allowed: true, used: -1, cap: DAILY_VISION_CAP_PER_USER, bypassed: true };
    }

    const used = count ?? 0;
    const allowed = used < DAILY_VISION_CAP_PER_USER;

    if (!allowed) {
      logInfo(ROUTE_TAG, "Vision-Daily-Cap erreicht", { user_id: userId, used, cap: DAILY_VISION_CAP_PER_USER });
    }

    return { allowed, used, cap: DAILY_VISION_CAP_PER_USER };
  } catch (err) {
    logError(ROUTE_TAG, "Unerwarteter Fehler — fail-open", err);
    return { allowed: true, used: -1, cap: DAILY_VISION_CAP_PER_USER, bypassed: true };
  }
}
