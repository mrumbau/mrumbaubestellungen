-- 08.10.2026 — Server tagsueber warm halten.
--
-- Gemessen am 08.10.: nach 12 Minuten ohne Aufruf dauert der erste
-- Seitenaufruf rund 450 ms laenger als die folgenden (Kaltstart der
-- Vercel-Funktion). Mit fuenf Nutzern gibt es solche Pausen den ganzen Tag.
-- Ein Aufruf alle fuenf Minuten (Mo-Sa, 6-20 Uhr) haelt die Instanz warm;
-- /api/health macht dabei eine kleine Datenbankabfrage, also wird auch die
-- Verbindung warm gehalten. 180 Aufrufe am Tag, kein Geheimnis noetig.

SELECT cron.schedule(
  'warmhalten',
  '*/5 6-20 * * 1-6',
  $warm$
  SELECT net.http_get(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_base_url') || '/api/health',
    headers := jsonb_build_object('User-Agent', 'Bestellwesen-Warmhalten'),
    timeout_milliseconds := 20000
  )::int;
  $warm$
);
