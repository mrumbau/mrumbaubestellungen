-- 22.09.2026 — Fehlende Haendler-Verknuepfungen nachtragen.
--
-- haendler_id wurde bisher ausschliesslich beim Anlegen der Bestellung
-- gesetzt (bestellung-finden.ts). War der Haendler in diesem Moment nicht
-- aufloesbar, blieb das Feld fuer immer leer — bei 179 von 377 Bestellungen
-- (47 %). Alle 179 hatten einen haendler_name, nur keine Verknuepfung.
--
-- Die Verknuepfung ist der Anker fuer die Match-Stufen 1, 4 und 5, fuer die
-- Haendler-Affinitaet und fuer die Stammdaten (vorausbezahlt, Zahlungsziel).
-- Fehlt sie, faellt alles auf Textvergleiche zurueck — dort entstehen die
-- Fehlzuordnungen.
--
-- Zuordnungsregel identisch zur Laufzeit-Logik in bestellung-propagate.ts:
--   Stufe 1: exakter Name (case-insensitiv)
--   Stufe 2: Praefix in beide Richtungen, mind. 3 Zeichen
-- Verknuepft wird NUR bei Eindeutigkeit auf der besten erreichten Stufe.
--
-- starts_with() statt LIKE, damit Prozent- und Unterstrich-Zeichen in
-- Haendlernamen nicht als Muster interpretiert werden.
--
-- Ergebnis des Laufs: 275 von 377 verknuepft (vorher 198), also 73 % statt
-- 53 %. Offen bleiben 102:
--   10 mehrdeutig — v.a. "Amazon Business": es gibt zwei Amazon-Stammsaetze
--      (Domains amazon.de und amazon.com). Die Dublette gehoert zusammen-
--      gefuehrt, dann loest sich der Fall von selbst.
--   92 ohne Stammsatz — Telekom, Hold & Spada, Peoplefone, Eisenschmid u.a.
--      wurden nie als Haendler angelegt. Bewusst NICHT automatisch erzeugt:
--      unter den Namen stehen auch Fehlerkennungen ("Nada Jerinic",
--      "Unbekannter Lieferant (…)"), die den Stamm verschmutzen wuerden.
WITH kandidaten AS (
  SELECT b.id AS bestellung_id, h.id AS hid,
         CASE WHEN lower(h.name) = lower(trim(b.haendler_name)) THEN 1 ELSE 2 END AS stufe
  FROM public.bestellungen b
  JOIN public.haendler h ON (
       lower(h.name) = lower(trim(b.haendler_name))
    OR (length(trim(h.name)) >= 3 AND starts_with(lower(trim(b.haendler_name)), lower(trim(h.name))))
    OR (length(trim(b.haendler_name)) >= 3 AND starts_with(lower(trim(h.name)), lower(trim(b.haendler_name))))
  )
  WHERE b.haendler_id IS NULL AND b.haendler_name IS NOT NULL
),
beste AS (
  SELECT bestellung_id, min(stufe) AS stufe FROM kandidaten GROUP BY bestellung_id
),
eindeutig AS (
  SELECT k.bestellung_id, (array_agg(k.hid))[1] AS hid
  FROM kandidaten k
  JOIN beste bs ON bs.bestellung_id = k.bestellung_id AND bs.stufe = k.stufe
  GROUP BY k.bestellung_id
  HAVING count(DISTINCT k.hid) = 1
)
UPDATE public.bestellungen b
   SET haendler_id = e.hid,
       updated_at  = NOW()
  FROM eindeutig e
 WHERE b.id = e.bestellung_id;
