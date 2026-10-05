-- 05.10.2026 — Eingang: Belege, die ueber eine Zwillingsmail verbucht wurden.
--
-- Gemessen: von 347 "offenen" Mails im Rechnungsordner hatten 60 einen Beleg,
-- der aus derselben Mail stammt (gleicher Betreff, gleicher Absender, Eingang
-- binnen 2 Tagen) und an einer Bestellung haengt — nur die Protokollzeile
-- dieser Mail wusste nichts davon. Typischer Fall: dieselbe Rechnung kam
-- zweimal an (Weiterleitung, zweiter Ordner), die Pipeline hat sie beim
-- ersten Mal verbucht und beim zweiten als Duplikat uebersprungen, ohne die
-- Bestellung in die zweite Protokollzeile zu schreiben.
--
-- Fuer die Kontrolle zaehlt, ob der Beleg verbucht IST, nicht ueber welche
-- der beiden Mails. Die Sicht loest das ueber den Beleg auf; der Link fuehrt
-- zur Bestellung. Die Protokollzeile selbst bleibt unveraendert.
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
  COALESCE(e.bestellung_id, dup.bestellung_id)             AS bestellung_id,
  b.bestellnummer,
  b.haendler_name,
  b.betrag,
  b.besteller_kuerzel,
  b.status                                                 AS bestellung_status,
  CASE
    WHEN COALESCE(e.bestellung_id, dup.bestellung_id) IS NOT NULL THEN 'verbucht'
    WHEN e.status = 'failed'              THEN 'fehlgeschlagen'
    WHEN e.status = 'irrelevant'          THEN 'aussortiert'
    ELSE                                       'ohne_bestellung'
  END                                                      AS kontrolle,
  e.gesichtet_am,
  e.gesichtet_von,
  (COALESCE(e.bestellung_id, dup.bestellung_id) IS NULL AND e.gesichtet_am IS NULL) AS offen
FROM public.email_processing_log e
LEFT JOIN public.mail_sync_folders f ON f.id = e.folder_id
LEFT JOIN LATERAL (
  SELECT d.bestellung_id
    FROM public.dokumente d
   WHERE e.bestellung_id IS NULL
     AND d.bestellung_id IS NOT NULL
     AND d.email_betreff = e.subject
     AND d.email_absender = e.sender
     AND abs(extract(epoch from (d.email_datum - COALESCE(e.received_at, e.created_at)))) < 172800
   ORDER BY d.created_at DESC
   LIMIT 1
) dup ON true
LEFT JOIN public.bestellungen b ON b.id = COALESCE(e.bestellung_id, dup.bestellung_id);
