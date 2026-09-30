-- 21.09.2026 — Stammdaten statt Raten.
--
-- Zwei gemessene Probleme, beide mit derselben Ursache: das System versucht
-- aus dem Rechnungstext zu erkennen, was laengst bekannt ist.
--
-- 1) Bezahlt-Erkennung. Von 44 Amazon-Business-Rechnungen wurde KEINE als
--    bereits bezahlt erkannt, bei Bernstein 4 von 4. Grund: die Erkennung
--    sucht Zahlungshinweise im Text — Bernstein schreibt "PayPal" auf die
--    Rechnung, Amazon nicht. Bessere KI loest das nicht.
--
-- 2) Faelligkeitsdatum. Die meisten Vendor-Parser setzen faelligkeitsdatum
--    hart auf null, nur Raab Karcher und der XRechnung-Pfad lesen es aus.
ALTER TABLE public.haendler
  ADD COLUMN IF NOT EXISTS immer_vorausbezahlt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS zahlungsziel_tage   integer;

COMMENT ON COLUMN public.haendler.immer_vorausbezahlt IS
  'true = bei diesem Haendler wird grundsaetzlich im Voraus bezahlt (Amazon Business, PayPal-Shops). Bestellungen werden als vorausbezahlt markiert und brauchen keine Rechnungsfreigabe — sie bleiben aber sichtbar, damit die Lieferung kontrolliert werden kann.';
COMMENT ON COLUMN public.haendler.zahlungsziel_tage IS
  'Zahlungsziel in Tagen. Nur Rueckfallwert: greift, wenn auf der Rechnung selbst kein Faelligkeitsdatum steht. NULL = unbekannt, dann bleibt die Faelligkeit leer.';

UPDATE public.haendler
   SET immer_vorausbezahlt = true
 WHERE lower(name) LIKE 'amazon%'
    OR lower(name) LIKE 'bernstein%';

-- Gegenstueck auf der Bestellung. Bewusst eine eigene Spalte und nicht der
-- vorhandene dokumente.bezahlt_bereits-Weg: dieser Wert stammt aus den
-- Stammdaten und nicht aus einer KI-Erkennung am einzelnen Beleg, und genau
-- diese Unterscheidung soll nachvollziehbar bleiben.
ALTER TABLE public.bestellungen
  ADD COLUMN IF NOT EXISTS vorausbezahlt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bestellungen.vorausbezahlt IS
  'true = beim Haendler ist grundsaetzlich vorausbezahlt (haendler.immer_vorausbezahlt). Keine Rechnungsfreigabe noetig, analog ist_gutschrift — die Bestellung bleibt aber fuer die Lieferkontrolle sichtbar.';

-- Bestandsdaten ueber die Verknuepfung nachziehen.
UPDATE public.bestellungen b
   SET vorausbezahlt = true
  FROM public.haendler h
 WHERE b.haendler_id = h.id
   AND h.immer_vorausbezahlt = true
   AND b.vorausbezahlt = false;

-- Und ueber den Namen: sieben der 27 Amazon-Business-Bestellungen hatten gar
-- keine haendler_id gesetzt und waeren sonst weiter in der Freigabe haengen
-- geblieben. Der Praefix-Vergleich laeuft nur gegen die ausdruecklich als
-- vorausbezahlt gepflegten Haendler, nicht gegen den gesamten Stamm.
UPDATE public.bestellungen b
   SET vorausbezahlt = true
  FROM public.haendler h
 WHERE h.immer_vorausbezahlt = true
   AND b.vorausbezahlt = false
   AND b.haendler_id IS NULL
   AND b.haendler_name ILIKE h.name || '%';
