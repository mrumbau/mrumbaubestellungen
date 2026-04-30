/**
 * Next.js Instrumentation Hook (auto-discovered).
 *
 * Wird beim Server-Boot ausgeführt. Hier validieren wir die Env-Vars
 * via Zod-Schema (siehe src/lib/env.ts) — fehlende oder falsche Werte
 * führen sofort zum Crash, nicht erst beim ersten Request.
 *
 * Läuft NUR im Node-Runtime (nicht Edge). Bei Edge-Routes wird Env separat
 * validiert beim ersten getEnv()-Aufruf.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnvAtBoot } = await import("@/lib/env");
    try {
      validateEnvAtBoot();
      console.log(JSON.stringify({
        level: "info",
        timestamp: new Date().toISOString(),
        route: "instrumentation",
        message: "Env-Validation erfolgreich beim Boot",
      }));
    } catch (err) {
      console.error(JSON.stringify({
        level: "error",
        timestamp: new Date().toISOString(),
        route: "instrumentation",
        message: "Env-Validation fehlgeschlagen — Server crash",
        error: err instanceof Error ? err.message : String(err),
      }));
      throw err;
    }
  }
}
