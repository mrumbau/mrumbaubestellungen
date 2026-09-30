-- 21.09.2026 — Fix: REFRESH MATERIALIZED VIEW CONCURRENTLY scheiterte seit
-- Anlage der View durchgehend (13.248 fehlgeschlagene Cron-Laeufe, Job 12).
--
-- Ursache: dashboard_kpis_global_singleton ist zwar UNIQUE, liegt aber auf
-- dem Ausdruck ((1)). Postgres verlangt fuer CONCURRENTLY zwingend einen
-- Unique-Index auf echten SPALTEN der Materialized View; Ausdruck-Indizes
-- werden nicht akzeptiert. refresh_dashboard_kpis() brach deshalb an der
-- globalen View ab, bevor sie dashboard_kpis_per_besteller erreichte —
-- daher waren BEIDE Views eingefroren (Stand 06.05.2026, also vier Monate).
--
-- refreshed_at ist als Schluessel geeignet: die View haelt per Definition
-- genau eine Zeile (der Singleton-Index erzwingt das weiterhin), damit ist
-- der Wert trivial eindeutig.
CREATE UNIQUE INDEX IF NOT EXISTS dashboard_kpis_global_refreshed_at_key
  ON public.dashboard_kpis_global (refreshed_at);
