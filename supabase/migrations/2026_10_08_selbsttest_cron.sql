-- 08.10.2026 — Taeglicher Selbsttest der Oberflaeche.
--
-- Ruft /api/cron/selbsttest wie die anderen Cron-Routen ueber pg_net auf;
-- Adresse und Geheimnis kommen aus dem Vault (app_base_url, cron_secret).
-- Die Route meldet sich als Pruefkonto an, laedt jede Hauptseite und
-- schreibt das Ergebnis nach webhook_logs (typ 'selbsttest').
--
-- Reihenfolge beim Ausrollen: erst der Code (Vercel READY), dann dieser Job.

SELECT cron.schedule(
  'selbsttest-daily',
  '10 6 * * *',
  $selbsttest$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_base_url') || '/api/cron/selbsttest',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )::int;
  $selbsttest$
);
