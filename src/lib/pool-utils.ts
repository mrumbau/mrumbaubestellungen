/**
 * pool-utils — pure helpers für Pool-2.0-State.
 *
 * 03.06.2026 (Sprint 1): Aging-Buckets + Aging-Color-Wash (subtle).
 * Sprint 2+ erweitert um Snooze/Defer/Reserve-Status-Helpers.
 */

export type AgingBucket = "fresh" | "ripening" | "stale" | "rotting";

const DAY_MS = 24 * 60 * 60 * 1000;

export function ageInDays(createdAtIso: string, now: Date = new Date()): number {
  const created = new Date(createdAtIso).getTime();
  if (Number.isNaN(created)) return 0;
  return Math.max(0, (now.getTime() - created) / DAY_MS);
}

/**
 * 4-State Aging-Bucket. Sprint 1 nutzt nur fresh/ripening/stale/rotting für
 * den subtilen Background-Wash auf Pool-Karten.
 *
 * Grenzen:
 *   fresh    = ≤ 2 Tage    → kein Background-Wash
 *   ripening = 2–7 Tage    → kein Background-Wash (noch normal)
 *   stale    = 7–14 Tage   → bg-amber-50/40
 *   rotting  = > 14 Tage   → bg-rose-50/40
 */
export function bucketAge(daysOld: number): AgingBucket {
  if (daysOld <= 2) return "fresh";
  if (daysOld <= 7) return "ripening";
  if (daysOld <= 14) return "stale";
  return "rotting";
}

/**
 * Tailwind-Wash-Klasse für den Pool-Card-Background. NULL = kein Wash
 * (Card behält Standard-Surface-Background).
 *
 * Drei-Sprachen-Disziplin: Wash maxt bei /40 Opacity, nie satter —
 * Owner-Pill (brand) und Status-Cell (status-tokens) müssen darüber
 * weiterhin lesbar bleiben.
 */
export function agingWashClass(bucket: AgingBucket): string | null {
  switch (bucket) {
    case "stale":
      return "bg-amber-50/40 dark:bg-amber-900/15";
    case "rotting":
      return "bg-rose-50/40 dark:bg-rose-900/15";
    case "fresh":
    case "ripening":
    default:
      return null;
  }
}

/**
 * Kombi-Helper: nimmt ISO-Date, gibt Wash-Klasse zurück.
 */
export function agingWashFromCreatedAt(
  createdAtIso: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!createdAtIso) return null;
  return agingWashClass(bucketAge(ageInDays(createdAtIso, now)));
}

/**
 * Menschen-lesbare Label für UI-Tooltips. Sprint 2 Inbox-Card nutzt das.
 */
export function describeAge(daysOld: number): string {
  if (daysOld < 1) return "seit weniger als einem Tag";
  const whole = Math.floor(daysOld);
  if (whole === 1) return "seit einem Tag";
  if (whole < 7) return `seit ${whole} Tagen`;
  if (whole < 14) return `seit über einer Woche`;
  if (whole < 30) return `seit über zwei Wochen`;
  return `seit über einem Monat`;
}
