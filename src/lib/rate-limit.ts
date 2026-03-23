// Hybrides Rate-Limiting: In-Memory (schnell) + Supabase (global/persistent)
// In-Memory schützt gegen Burst-Attacks auf einer Instanz,
// Supabase-basiertes Limiting schützt global über alle Vercel-Instanzen hinweg.

import { createServiceClient } from "@/lib/supabase";
import { logError } from "@/lib/logger";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Alte Einträge alle 5 Minuten aufräumen
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * In-Memory Rate-Limiting (pro Instanz).
 * Schnell, aber nicht global — als erste Verteidigungslinie.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number = 60_000
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  entry.count++;
  const allowed = entry.count <= maxRequests;
  return {
    allowed,
    remaining: Math.max(0, maxRequests - entry.count),
    resetAt: entry.resetAt,
  };
}

/**
 * Globales Rate-Limiting via Supabase (webhook_logs Tabelle).
 * Zählt Requests der letzten X Sekunden für einen Schlüssel.
 * Langsamer als In-Memory, aber konsistent über alle Instanzen.
 * Nutzt vorhandene webhook_logs Tabelle — kein neues Schema nötig.
 */
export async function checkGlobalRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number = 60_000
): Promise<{ allowed: boolean; count: number }> {
  try {
    const supabase = createServiceClient();
    const since = new Date(Date.now() - windowMs).toISOString();

    const { count, error } = await supabase
      .from("webhook_logs")
      .select("*", { count: "exact", head: true })
      .eq("typ", `rate_limit:${key}`)
      .gte("created_at", since);

    if (error) {
      // Bei DB-Fehler: sperren (fail-closed) — sicherer als durchlassen
      logError("rate-limit", "Globales Rate-Limit-Check fehlgeschlagen", error);
      return { allowed: false, count: maxRequests };
    }

    const currentCount = count || 0;

    if (currentCount >= maxRequests) {
      return { allowed: false, count: currentCount };
    }

    // Request zählen
    await supabase.from("webhook_logs").insert({
      typ: `rate_limit:${key}`,
      status: "counted",
    });

    return { allowed: true, count: currentCount + 1 };
  } catch {
    // Fail-closed: bei Fehler sperren
    return { allowed: false, count: maxRequests };
  }
}

export function getRateLimitKey(request: Request, prefix: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return `${prefix}:${ip}`;
}
