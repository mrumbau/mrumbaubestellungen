/**
 * Zentrale Env-Validation mit Zod.
 *
 * Ziel:
 * - Alle env-Vars sind hier deklariert + typisiert
 * - Fehlende oder falsch formatierte Vars führen zum Crash beim Server-Boot
 *   (via instrumentation.ts), nicht erst beim ersten Request
 * - Konsumenten verwenden `getEnv().<VAR>` statt `process.env.<VAR>!` —
 *   keine Non-Null-Assertions mehr nötig, voll typisiert
 *
 * Migration: Konsumenten werden inkrementell auf getEnv() umgestellt.
 * Bestehender `process.env.X`-Code funktioniert weiter — Boot-Validation
 * deckt das ab solange Var hier im Schema gelistet ist.
 */

import { z } from "zod";

const envSchema = z.object({
  // ── Supabase (production-critical) ──────────────────────────────────────
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // ── OpenAI (production-critical) ────────────────────────────────────────
  OPENAI_API_KEY: z.string().startsWith("sk-"),

  // ── Webhook/Cron-Secrets (production-critical) ──────────────────────────
  CRON_SECRET: z.string().min(32),
  MAKE_WEBHOOK_SECRET: z.string().min(16),
  EXTENSION_SECRET: z.string().min(8),

  // ── Microsoft Graph (production-critical für Email-Sync) ────────────────
  MS_TENANT_ID: z.string().uuid(),
  MS_CLIENT_ID: z.string().uuid(),
  MS_CLIENT_SECRET: z.string().min(1),
  MS_MAILBOX: z.string().email(),

  // ── CardScan (optionale Features) ───────────────────────────────────────
  GOOGLE_CLOUD_VISION_API_KEY: z.string().optional(),
  DAS_PROGRAMM_TOKEN_CRM1: z.string().optional(),
  DAS_PROGRAMM_TOKEN_CRM2: z.string().optional(),
  DAS_PROGRAMM_ENDPOINT: z.string().url().optional(),

  // ── SMTP (Email-Versand für Erinnerungen / DATEV) ───────────────────────
  SMTP_USER: z.string().email().optional(),
  SMTP_PASSWORD: z.string().optional(),

  // ── Internal Loopback / Dev-Helpers ─────────────────────────────────────
  // Email-Pipeline classify.ts/ingest.ts machen HTTP-Loopback. Production:
  // VERCEL_URL wird auto-injected. Dev: NEXT_PUBLIC_APP_URL oder localhost.
  // INTERNAL_APP_URL kann beides explizit überschreiben.
  INTERNAL_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  VERCEL_URL: z.string().optional(),

  // ── Runtime-Defaults ────────────────────────────────────────────────────
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

/**
 * Liefert validierte Env. Wirft beim ersten Aufruf wenn Schema fehlschlägt.
 * Cached danach — kein Re-Parse pro Aufruf.
 */
export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `❌ Env-Validation fehlgeschlagen — Server-Boot abgebrochen.\n${issues}\n\nPrüfe .env.local + Vercel-ENV. Optional vergleiche .env.example.`,
    );
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

/**
 * Wird aus instrumentation.ts beim Server-Boot aufgerufen.
 * Crash hier ist gewollt — Server soll nicht starten wenn Env unvollständig.
 */
export function validateEnvAtBoot(): void {
  getEnv();
}
