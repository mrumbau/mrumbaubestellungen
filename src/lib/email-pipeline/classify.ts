/**
 * Email-Klassifikations-Wrapper (Pipeline-Konsumenten-Interface).
 *
 * R5a/F3.C3: Vorher HTTP-Loopback an `/api/webhook/email-check`. Jetzt
 * direkter Lib-Call. Effekte:
 *   - Cost-Tracking (R2.4) propagiert via AsyncLocalStorage
 *   - ~50-100 ms weniger Latenz pro Mail
 *   - Keine INTERNAL_APP_URL-Abhängigkeit mehr für diesen Pfad
 *
 * Bei Service-Errors throwt classifyEmailLogic — replay.ts catched, ruft
 * markFailed → retry-cron holt's später (siehe R2.2/F3.C1).
 */

import { classifyEmailLogic } from "./classify-logic";
import type { ClassifyEmailInput, ClassifyEmailResult } from "./types";

export async function classifyEmail(
  input: ClassifyEmailInput,
): Promise<ClassifyEmailResult> {
  return classifyEmailLogic(input);
}
