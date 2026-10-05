-- 03.10.2026 — Umbau 1: Nichts verschwindet mehr.
--
-- Zwei Entscheidungen von MH vom 03.10.:
--   1. Im Rechnungsordner muss Aussortiertes gesichtet werden, bevor es
--      verschwindet.
--   2. Gutschriften und vorausbezahlte Vorgaenge gelten als erledigt, sobald
--      ihre Belege vollstaendig sind, und wandern ins Archiv.
--
-- Teil 1: Sichtung. Von 657 Mails im Ordner "In Sachen Rechnungen" sind
-- 337 an keiner Bestellung gelandet und von niemandem gesehen worden. Die
-- Sichtung ist der Haken, der aus "still aussortiert" ein "gesehen und
-- bewusst beiseitegelegt" macht.
ALTER TABLE public.email_processing_log
  ADD COLUMN IF NOT EXISTS gesichtet_am  timestamptz,
  ADD COLUMN IF NOT EXISTS gesichtet_von text;

COMMENT ON COLUMN public.email_processing_log.gesichtet_am IS
  'Wann ein Mensch diese Mail im Eingang gesichtet und beiseitegelegt hat. NULL = noch niemand hat sie gesehen. Nur fuer Mails ohne Bestellung relevant.';

-- Fuer den Zaehler in der Navigation: offene Mails im Rechnungsordner.
CREATE INDEX IF NOT EXISTS idx_email_log_eingang_offen
  ON public.email_processing_log (folder_id)
  WHERE bestellung_id IS NULL AND gesichtet_am IS NULL;

CREATE OR REPLACE VIEW public.v_rechnungseingang
WITH (security_invoker = true) AS
SELECT
  COALESCE(e.graph_message_id, e.internet_message_id)      AS id,
  COALESCE(e.received_at, e.created_at)                    AS eingang,
  COALESCE(f.folder_name, '(unbekannt)')                   AS ordner,
  e.sender                                                 AS absender,
  e.subject                                                AS betreff,
  e.status,
  e.ki_classified_as                                       AS ki_typ,
  e.folder_hint                                            AS erwarteter_typ,
  COALESCE(e.folder_mismatch, false)                       AS ordner_passt_nicht,
  COALESCE(e.has_attachments, false)                       AS hat_anhang,
  e.error_msg                                              AS fehler,
  e.bestellung_id,
  b.bestellnummer,
  b.haendler_name,
  b.betrag,
  b.besteller_kuerzel,
  b.status                                                 AS bestellung_status,
  CASE
    WHEN e.bestellung_id IS NOT NULL      THEN 'verbucht'
    WHEN e.status = 'failed'              THEN 'fehlgeschlagen'
    WHEN e.status = 'irrelevant'          THEN 'aussortiert'
    ELSE                                       'ohne_bestellung'
  END                                                      AS kontrolle,
  -- Neue Spalten HINTER den bestehenden: CREATE OR REPLACE VIEW darf
  -- vorhandene Spalten weder umbenennen noch umsortieren.
  e.gesichtet_am,
  e.gesichtet_von,
  -- "offen" = braucht einen Blick: keine Bestellung und noch nicht gesichtet.
  (e.bestellung_id IS NULL AND e.gesichtet_am IS NULL)     AS offen
FROM public.email_processing_log e
LEFT JOIN public.mail_sync_folders f ON f.id = e.folder_id
LEFT JOIN public.bestellungen      b ON b.id = e.bestellung_id;

-- Teil 2: Erledigt ohne Freigabe.
--
-- "In Arbeit" leerte sich bisher ausschliesslich ueber die Freigabe. Was
-- bewusst keine Freigabe braucht (Gutschrift, vorausbezahlt), hatte deshalb
-- keinen Ausgang: 5 Gutschriften standen dauerhaft in der Liste, und jede
-- neue Amazon-Bestellung waere dort liegengeblieben.
--
-- erledigt_am wird vom Trigger gesetzt, nie von Hand — die Regel steht an
-- genau einer Stelle und gilt fuer alte wie neue Vorgaenge gleich.
ALTER TABLE public.bestellungen
  ADD COLUMN IF NOT EXISTS erledigt_am timestamptz;

COMMENT ON COLUMN public.bestellungen.erledigt_am IS
  'Gesetzt, wenn der Vorgang keine Freigabe braucht (Gutschrift oder vorausbezahlt) und seine Belege vollstaendig sind. Dann gilt er als erledigt und gehoert ins Archiv. Wird ausschliesslich vom Trigger gepflegt.';

-- Dollar-Quoting mit Tag: das Supabase-MCP-Werkzeug haengt bei nackten $$
-- (01.-05.10. dreimal in ein 60-s-Limit gelaufen, mit $erledigt$ sofort durch).
CREATE OR REPLACE FUNCTION public.bestellungen_erledigt_pflegen()
RETURNS trigger
LANGUAGE plpgsql
AS $erledigt$
BEGIN
  IF (COALESCE(NEW.ist_gutschrift, false) OR COALESCE(NEW.vorausbezahlt, false))
     AND NEW.status = 'vollstaendig' THEN
    NEW.erledigt_am := COALESCE(NEW.erledigt_am, now());
  ELSE
    NEW.erledigt_am := NULL;
  END IF;
  RETURN NEW;
END;
$erledigt$;

DROP TRIGGER IF EXISTS trg_bestellungen_erledigt ON public.bestellungen;
CREATE TRIGGER trg_bestellungen_erledigt
  BEFORE INSERT OR UPDATE ON public.bestellungen
  FOR EACH ROW EXECUTE FUNCTION public.bestellungen_erledigt_pflegen();

-- Bestand nachziehen: der Trigger rechnet beim Durchlauf jede Zeile neu.
UPDATE public.bestellungen
   SET status = status
 WHERE (COALESCE(ist_gutschrift, false) OR COALESCE(vorausbezahlt, false))
   AND status = 'vollstaendig';

CREATE INDEX IF NOT EXISTS idx_bestellungen_erledigt_am
  ON public.bestellungen (erledigt_am)
  WHERE erledigt_am IS NOT NULL;
