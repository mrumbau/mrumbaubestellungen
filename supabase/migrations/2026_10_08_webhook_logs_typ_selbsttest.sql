-- 08.10.2026 — webhook_logs darf auch Selbsttest-Laeufe aufnehmen.
--
-- Der erste Lauf von /api/cron/selbsttest kam mit 200 zurueck, aber die
-- Ergebniszeile fehlte: typ 'selbsttest' verstiess gegen den CHECK, und die
-- Route hat den Insert-Fehler nicht geprueft. Beides korrigiert.

alter table public.webhook_logs drop constraint if exists webhook_logs_typ_check;
alter table public.webhook_logs add constraint webhook_logs_typ_check
  check (typ = any (array['email'::text, 'extension'::text, 'cron'::text, 'cron_cleanup'::text, 'selbsttest'::text]));
