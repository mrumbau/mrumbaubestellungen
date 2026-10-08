-- 08.10.2026 — Rechte auf SECURITY-DEFINER-Funktionen und -Sichten enger ziehen.
--
-- Supabase-Advisor (security): Neun SECURITY-DEFINER-Funktionen waren fuer die
-- Rolle anon ausfuehrbar, d.h. jeder mit dem oeffentlichen anon-Key haette per
-- /rest/v1/rpc/... Dokumente anlegen, Bestellungen aus dem Pool nehmen oder
-- umhaengen koennen. Trigger- und Cron-Funktionen braucht auch kein
-- angemeldeter Nutzer per RPC.
--
-- Wer was weiter darf:
--   service_role   alles (Pipeline, Cron)
--   authenticated  die pool_*-Funktionen (werden aus der App per RPC gerufen)
--   anon           nichts davon

-- Trigger-Funktionen: nur Trigger rufen sie, niemand per RPC.
revoke execute on function public.auto_set_bezahlt_on_bereits() from anon, authenticated, public;
revoke execute on function public.sync_bestellung_bezahlt_from_dokumente() from anon, authenticated, public;

-- Cron-Ausloeser: nur pg_cron / service_role.
revoke execute on function public.trigger_erinnerungen_owner() from anon, authenticated, public;
revoke execute on function public.trigger_erinnerungen_pool() from anon, authenticated, public;
revoke execute on function public.trigger_second_review_emails() from anon, authenticated, public;

-- Pipeline-Schreibpfad: nur service_role.
revoke execute on function public.persist_dokument_atomic(
  uuid, text, text, text, text, text, text, timestamptz, jsonb, text, text, text,
  jsonb, numeric, numeric, numeric, date, date, text, text, text, text, date, boolean
) from anon, authenticated, public;

-- Pool-Funktionen: angemeldete Nutzer ja, anon nein.
revoke execute on function public.pool_claim_bestellung(uuid) from anon, public;
revoke execute on function public.pool_reassign_bestellung(uuid, text, text) from anon, public;
revoke execute on function public.pool_return_to_pool(uuid, text) from anon, public;

-- Fester Suchpfad fuer zwei Funktionen ohne (Advisor: function_search_path_mutable).
alter function public.bestellungen_erledigt_pflegen() set search_path = public;
alter function public.trigger_second_review_emails() set search_path = public;

-- Zwei reine Admin-Sichten laufen mit den Rechten des Lesers statt des Erstellers.
-- Die Affinitaets-Sichten (vw_user_*_affinity) bleiben DEFINER: sie aggregieren
-- bewusst ueber alle Besteller hinweg und werden im Lane-Loader fuer jeden
-- Nutzer gelesen.
alter view public.dokumente_cross_bestellung_duplikate set (security_invoker = true);
alter view public.v_pipeline_logs set (security_invoker = true);
