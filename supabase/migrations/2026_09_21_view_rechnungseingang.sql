-- 21.09.2026 — Kontrollansicht "Rechnungseingang".
--
-- Ausgangslage (gemessen am 21.09.2026): von 615 Mails im Outlook-Ordner
-- "In Sachen Rechnungen" waren nur 291 einer Bestellung zugeordnet.
--   102 wurden verarbeitet, landeten aber an keiner Bestellung
--   220 wurden als "irrelevant" stillschweigend aussortiert
--     2 sind fehlgeschlagen
-- Mehr als die Haelfte des Rechnungseingangs war also nirgends sichtbar —
-- und niemand konnte pruefen, ob eine Rechnung fehlt. Genau das soll diese
-- Sicht beantworten: was kam rein, was ist verbucht, was nicht.
--
-- v_pipeline_logs deckt das nicht ab: dort fehlt der Ordnerbezug (nur
-- folder_hint, nicht der echte Ordner), es gibt keine Verknuepfung zur
-- Bestellung und keine fachliche Einordnung.
--
-- security_invoker: die Sicht laeuft mit den Rechten des aufrufenden
-- Benutzers, damit RLS auf email_processing_log und bestellungen greift und
-- die Sicht keine Daten freilegt, die der Benutzer sonst nicht sehen darf.
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
  -- Fachliche Einordnung fuer die Kontrolle. Reihenfolge ist bewusst:
  -- eine zugeordnete Bestellung schlaegt alles andere, auch wenn der Lauf
  -- selbst als "failed" endete (z.B. Folgeschritt kaputt, Beleg haengt aber).
  CASE
    WHEN e.bestellung_id IS NOT NULL      THEN 'verbucht'
    WHEN e.status = 'failed'              THEN 'fehlgeschlagen'
    WHEN e.status = 'irrelevant'          THEN 'aussortiert'
    ELSE                                       'ohne_bestellung'
  END                                                      AS kontrolle
FROM public.email_processing_log e
LEFT JOIN public.mail_sync_folders f ON f.id = e.folder_id
LEFT JOIN public.bestellungen      b ON b.id = e.bestellung_id;

COMMENT ON VIEW public.v_rechnungseingang IS
  'Kontrollansicht: jede eingegangene Mail mit Ordner, Status und zugeordneter Bestellung. Beantwortet "ist alles verbucht, was im Rechnungsordner lag?".';
