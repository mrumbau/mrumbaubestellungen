-- 21.09.2026 — cron.job_run_details hatte keine Retention und war auf
-- 107 MB / 573.014 Zeilen angewachsen (aelteste vom 29.04.2026) — die mit
-- Abstand groesste Tabelle der Datenbank, 25x groesser als saemtliche
-- Geschaeftsdaten zusammen (bestellungen 888 kB, dokumente 2384 kB).
--
-- Auf der damaligen Nano-Instanz hat das den Cache verdraengt und zu
-- "job startup timeout"-Fehlern gefuehrt: pg_cron konnte nicht einmal mehr
-- einen Worker starten. Betroffen war u.a. trigger_discover_emails (215
-- Fehlschlaege) — in diesen Fenstern wurden eingehende Mails nie abgeholt,
-- ohne jede sichtbare Fehlermeldung in der App.
--
-- Fuer net._http_response existiert bereits ein solcher Aufraeum-Job
-- (Job 5, taeglich 03:00, 7 Tage Retention) — fuer das Cron-Log wurde
-- seinerzeit keiner angelegt. Das wird hier nachgeholt, mit gleicher
-- Aufbewahrung und um 30 Minuten versetzt.
--
-- Einmalig wurde beim Anlegen zusaetzlich aufgeraeumt:
--   DELETE FROM cron.job_run_details WHERE start_time < NOW() - INTERVAL '7 days';
--   VACUUM FULL cron.job_run_details;   -- 107 MB -> 5200 kB
SELECT cron.schedule(
  'cleanup-cron-job-run-details',
  '30 3 * * *',
  $$DELETE FROM cron.job_run_details WHERE start_time < NOW() - INTERVAL '7 days'$$
);
