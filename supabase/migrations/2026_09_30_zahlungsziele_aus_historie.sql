-- 30.09.2026 — Zahlungsziele aus den eigenen Belegen ableiten, nicht erfinden.
--
-- Ausgangslage: 162 Rechnungen stehen ohne Faelligkeitsdatum da. Die meisten
-- Vendor-Parser setzen faelligkeitsdatum hart auf null; nur Raab Karcher und
-- der XRechnung-Pfad lesen es wirklich aus. Seit dem 21.09. gibt es
-- haendler.zahlungsziel_tage als Rueckfallwert — die Spalte war aber bei
-- jedem Haendler leer, der Rueckfall lief also ins Leere.
--
-- Diese Migration fuellt sie. Zahlungsziele sind Finanzdaten: geraten wird
-- hier nichts. Gemessen wird ausschliesslich, was auf den eigenen Rechnungen
-- schon dokumentiert ist:
--
--     faelligkeitsdatum - coalesce(bestelldatum, created_at::date)
--
-- Uebernommen wird der Median, und nur wenn das Bild eindeutig ist:
--   * mindestens 3 Belege mit Faelligkeitsdatum,
--   * Spanne zwischen kleinstem und groesstem Wert hoechstens 3 Tage,
--   * Einzelwert plausibel (1..120 Tage — schuetzt vor Tippfehlern im Jahr
--     und vor Rechnungen, die lange nach Lieferung erfasst wurden).
--
-- Damit qualifizieren sich 6 Haendler. Die grossen Lieferanten fallen
-- bewusst durch das Raster: Raab Karcher streut 9..33 Tage, Klaus Alter
-- 18..96, Baustoff Union 5..56. Dort einen Mittelwert einzutragen wuerde
-- Mahnungen produzieren statt sie zu verhindern. Sie bleiben NULL — und
-- NULL heisst im Code "unbekannt", dann wird kein Datum erfunden
-- (siehe addiereTage() in bestellung-propagate.ts). Diese Haendler traegt
-- MH bei Gelegenheit selbst im Feld "Zahlungsziel (Tage)" nach; ein
-- gepflegter Wert wird hier nie ueberschrieben.
--
-- Wichtig: der Wert greift ausschliesslich als Rueckfall. Steht auf der
-- Rechnung selbst ein Faelligkeitsdatum, gewinnt immer die Rechnung.
WITH zuordnung AS (
  SELECT coalesce(h1.id, h2.id) AS hid,
         (b.faelligkeitsdatum - coalesce(b.bestelldatum, b.created_at::date)) AS tage
    FROM public.bestellungen b
    LEFT JOIN public.haendler h1 ON h1.id = b.haendler_id
    -- Bestellungen ohne Verknuepfung ueber den exakten Namen mitnehmen,
    -- sonst faellt ein Teil der Historie unter den Tisch.
    LEFT JOIN public.haendler h2 ON b.haendler_id IS NULL
                                AND lower(b.haendler_name) = lower(h2.name)
   WHERE b.faelligkeitsdatum IS NOT NULL
),
gemessen AS (
  SELECT hid,
         (percentile_disc(0.5) WITHIN GROUP (ORDER BY tage))::int AS median_tage
    FROM zuordnung
   WHERE hid IS NOT NULL
     AND tage BETWEEN 1 AND 120
   GROUP BY hid
  HAVING count(*) >= 3
     AND (max(tage) - min(tage)) <= 3
)
UPDATE public.haendler h
   SET zahlungsziel_tage = g.median_tage
  FROM gemessen g
 WHERE h.id = g.hid
   AND h.zahlungsziel_tage IS NULL;
