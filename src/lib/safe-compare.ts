import { timingSafeEqual } from "crypto";

/**
 * Timing-safe string comparison for secrets.
 * Returns false if either value is missing/empty.
 */
export function safeCompare(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
