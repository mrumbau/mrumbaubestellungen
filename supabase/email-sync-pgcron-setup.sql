-- ════════════════════════════════════════════════════════════════════════
-- Email-Sync pg_cron Setup (Phase 2 Option D — Fan-out-Architektur)
-- ════════════════════════════════════════════════════════════════════════
--
-- WAS DAS MACHT
-- 1. Speichert CRON_SECRET + App-Base-URL verschlüsselt im Supabase Vault
-- 2. Schedules 4 Cron-Jobs in pg_cron:
--    a) discover-emails        (alle 2 Min) — neue Mails aus Outlook holen
--    b) process-pending-emails (jede Min)   — pending-Mails an Lambda fan-outen
--    c) retry-failed-emails    (stündlich)  — failed Mails auto-retryen
--    d) cleanup-stale-pending  (alle 5 Min) — hängende pending → failed
--
-- VORAUSSETZUNG
-- - Migrations müssen schon gelaufen sein (Tabellen + Helper-Functions)
-- - Du musst den AKTUELLEN CRON_SECRET-Wert kennen (steht in Vercel-ENV)
--
-- ANLEITUNG
-- 1. Öffne Supabase Dashboard → dein Projekt → SQL Editor → New Query
-- 2. Kopiere DIESES script rein
-- 3. Ersetze den Platzhalter <DEIN_CRON_SECRET> durch den echten Wert
--    (gleicher Wert wie in Vercel-ENV CRON_SECRET)
-- 4. Wenn deine Production-URL nicht cloud.mrumbau.de ist, anpassen
-- 5. "Run" klicken
--
-- VERIFIZIERUNG NACH DEM RUN
--   SELECT * FROM cron.job;                  -- 4 Jobs sichtbar?
--   SELECT * FROM cron.job_run_details ORDER BY end_time DESC LIMIT 10;
--                                            -- Jobs laufen erfolgreich?
--   SELECT * FROM net._http_response ORDER BY created DESC LIMIT 10;
--                                            -- HTTP-POSTs an Vercel sichtbar?
--
-- DEAKTIVIERUNG (z.B. für Wartung)
--   SELECT cron.unschedule('discover-emails');
--   SELECT cron.unschedule('process-pending-emails');
--   SELECT cron.unschedule('retry-failed-emails');
--   SELECT cron.unschedule('cleanup-stale-pending');
-- ════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────
-- SCHRITT 1: Secrets in Vault speichern
-- ────────────────────────────────────────────────────────────────────────

-- CRON_SECRET — gleicher Wert wie in Vercel-ENV
SELECT vault.create_secret(
  '<DEIN_CRON_SECRET>',  -- ← HIER EINSETZEN!
  'cron_secret',
  'Bearer-Token für /api/cron/* Endpoints. Identisch zu Vercel-ENV CRON_SECRET.'
);

-- App-Base-URL — bei Bedarf für Preview-Deploys anpassen
SELECT vault.create_secret(
  'https://cloud.mrumbau.de',
  'app_base_url',
  'Production-URL für Vercel-Lambda-Calls. Ohne trailing slash.'
);

-- ────────────────────────────────────────────────────────────────────────
-- SCHRITT 2: Cron-Jobs schedulen
-- ────────────────────────────────────────────────────────────────────────

-- Job 1: discover-emails (alle 2 Min)
-- Holt neue Mails von Microsoft Graph, schreibt sie als 'pending' in DB.
-- Kein Pipeline-Call hier — das macht Job 2.
SELECT cron.schedule(
  'discover-emails',
  '*/2 * * * *',
  $$ SELECT public.trigger_discover_emails(); $$
);

-- Job 2: process-pending-emails (jede Minute)
-- Pro pending-Mail einen async POST an /api/cron/process-one. Echte Parallelität.
-- Concurrency-Cap 30/Tick (in fan_out_pending_mails-Function).
SELECT cron.schedule(
  'process-pending-emails',
  '* * * * *',
  $$ SELECT public.fan_out_pending_mails(); $$
);

-- Job 3: retry-failed-emails (stündlich)
-- Holt failed Mails der letzten 24h und versucht sie erneut. Max 3 Retries.
SELECT cron.schedule(
  'retry-failed-emails',
  '0 * * * *',
  $$ SELECT public.trigger_retry_failed_emails(); $$
);

-- Job 4: cleanup-stale-pending (alle 5 Min)
-- Pure SQL, kein Lambda. Markiert pending-Mails älter als 10 min als failed.
SELECT cron.schedule(
  'cleanup-stale-pending',
  '*/5 * * * *',
  $$ SELECT public.cleanup_stale_pending_mails(); $$
);

-- ────────────────────────────────────────────────────────────────────────
-- SCHRITT 3: Verifizierung
-- ────────────────────────────────────────────────────────────────────────

-- Diese Query zeigt alle 4 Jobs aktiv:
SELECT
  jobname,
  schedule,
  active,
  jobid
FROM cron.job
WHERE jobname IN (
  'discover-emails',
  'process-pending-emails',
  'retry-failed-emails',
  'cleanup-stale-pending'
)
ORDER BY jobname;
