-- 30.09.2026 — Rollen nach Ansage von MH.
--
-- MT (Marlon Tschon) wird Admin. Sein Flag nimmt_neue_bestellungen bleibt
-- bewusst auf false: die Uebergabe der offenen Vorgaenge an CR vom 21.09.
-- gilt weiter, MT soll verwalten, nicht wieder bestellen. Admin-Konten sind
-- ohnehin kein Zuordnungsziel.
UPDATE public.benutzer_rollen
   SET rolle = 'admin'
 WHERE kuerzel = 'MT' AND rolle <> 'admin';

-- CR (Carsten Reuter) wird Geschaeftsfuehrung: verwaltet alles, bekommt aber
-- weiterhin Bestellungen zugeordnet — er ist der einzige aktive Besteller.
UPDATE public.benutzer_rollen
   SET rolle = 'geschaeftsfuehrer'
 WHERE kuerzel = 'CR' AND rolle <> 'geschaeftsfuehrer';
