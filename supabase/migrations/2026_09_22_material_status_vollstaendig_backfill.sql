-- 22.09.2026 — Bestand an die gelockerte Dokumentenpflicht angleichen.
--
-- DOKUMENT_CONFIG.material verlangte bisher Bestaetigung UND Lieferschein UND
-- Rechnung. Das traf auf 21 von 286 Material-Bestellungen zu (7 %), weil
-- viele Haendler nur eine Rechnung schicken: 316 von 377 Rechnungen kamen
-- ohne Lieferschein, 276 ohne Bestaetigung.
--
-- Folge: KEINE einzige Material-Bestellung erreichte je den Status
-- "vollstaendig" — 237 sprangen direkt von "offen" auf "freigegeben". Der
-- Status war fuer Material toter Code, und "offen" sagte nichts darueber, ob
-- etwas zu tun ist.
--
-- Ab jetzt ist die Rechnung das Pflichtdokument. "vollstaendig" heisst damit,
-- was CLAUDE.md immer schon dazu sagte: bereit zur Freigabe.
--
-- Beachtet die Pool-Invariante: UNBEKANNT-Material bleibt auf "offen", bis es
-- zugeordnet ist. "abweichung" und "freigegeben" werden nie ueberschrieben.
--
-- Ergebnis des Laufs: 23 Material-Bestellungen auf "vollstaendig", 27 bleiben
-- zu Recht "offen" (dort fehlt die Rechnung).
UPDATE public.bestellungen
   SET status     = 'vollstaendig',
       updated_at = NOW()
 WHERE bestellungsart    = 'material'
   AND status            = 'offen'
   AND hat_rechnung      = true
   AND besteller_kuerzel <> 'UNBEKANNT'
   AND archiviert_am IS NULL;
