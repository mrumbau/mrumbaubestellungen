-- 21.09.2026 — Marlon (MT) geht ins Studium. Seine 24 noch offenen Vorgaenge
-- gehen an Carsten (CR), damit sie jemand zu Ende bringt:
--   23x material         10.021,35 EUR  (04.08. - 20.09.2026)
--    1x subunternehmer    3.535,65 EUR  (07.09.2026)
--
-- Bewusst NICHT angefasst: die 189 abgeschlossenen Bestellungen
-- (freigegeben / verworfen / storniert) sowie alles Archivierte. Dort ist
-- "MT hat bestellt" eine Tatsache und keine Fehlzuordnung — die Freigaben in
-- der Buchhaltung haengen daran. Wer historisch bestellt hat, bleibt stehen.
--
-- Ergebnis nach dem Lauf: MT 189 gesamt / 0 offen, CR 109 gesamt / 63 offen.
UPDATE public.bestellungen b
   SET besteller_kuerzel = 'CR',
       besteller_name    = (SELECT name FROM public.benutzer_rollen WHERE kuerzel = 'CR'),
       zuordnung_methode = 'uebergabe_mt_cr_2026_09_21',
       updated_at        = NOW()
 WHERE b.besteller_kuerzel = 'MT'
   AND b.archiviert_am IS NULL
   AND b.status NOT IN ('freigegeben', 'verworfen', 'storniert');
