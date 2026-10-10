-- 10.10.2026 — Eingang: ein Aufruf fuer die Kopfzahlen statt fuenf, und ein
-- Index fuer den Zwillings-Abgleich der Sicht.
--
-- Gemessen am 09.10.2026: `select count(*) from v_rechnungseingang where
-- kontrolle = 'verbucht'` brauchte 788 ms, weil die Sicht fuer jede
-- Protokollzeile ohne Bestellung die Tabelle dokumente komplett durchsucht
-- (Seq Scan, 4.941 Schleifen). Die Eingang-Seite stellte sechs solcher
-- Abfragen parallel. Mit dem Index ist der Abgleich ein Index-Zugriff; mit
-- der Funktion holt die Seite alle Kopfzahlen in einem Roundtrip.
CREATE INDEX IF NOT EXISTS idx_dokumente_mail_zwilling
  ON public.dokumente (email_absender, email_betreff)
  WHERE bestellung_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.eingang_zaehler(p_ordner text)
RETURNS TABLE (kontrolle text, anzahl bigint, offen bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT v.kontrolle,
         count(*)::bigint                        AS anzahl,
         count(*) FILTER (WHERE v.offen)::bigint AS offen
    FROM public.v_rechnungseingang v
   WHERE v.ordner = p_ordner
   GROUP BY v.kontrolle;
$$;

-- Laeuft mit den Rechten des Aufrufers (SECURITY INVOKER, die Sicht ebenso):
-- RLS auf email_processing_log gilt wie bei den bisherigen Einzelabfragen.
REVOKE ALL ON FUNCTION public.eingang_zaehler(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eingang_zaehler(text) TO authenticated, service_role;
