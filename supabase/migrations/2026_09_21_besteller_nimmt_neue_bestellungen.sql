-- 21.09.2026 — Marlon (MT) geht ins Studium; neue Bestellungen sollen an
-- Carsten (CR) gehen. Sein Zugang bleibt bestehen, er soll seine Historie
-- weiter sehen koennen.
--
-- Ein hart codierter MT-Ausschluss waere die falsche Loesung: beim naechsten
-- Personalwechsel stuende dasselbe Problem wieder an. Stattdessen ein
-- explizites Flag pro Benutzer.
--
-- Warum das ueberhaupt noetig ist: die Besteller-Zuordnung entscheidet ueber
-- Haendler-Affinitaet (Stufe 3) und KI-Historie (Stufe 4.5) — beide lesen die
-- letzten 50 Bestellungen je Haendler. MT hat 189 Bestellungen in der
-- Historie, die bleiben auch nach dem Wechsel stehen. Ohne dieses Flag wuerde
-- die Affinitaet also weiter auf MT zeigen und jede neue Bestellung zurueck an
-- ihn haengen.
ALTER TABLE public.benutzer_rollen
  ADD COLUMN IF NOT EXISTS nimmt_neue_bestellungen boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.benutzer_rollen.nimmt_neue_bestellungen IS
  'false = bekommt keine NEUEN Bestellungen mehr zugeordnet (Pipeline-Stufen 3/4/4.5 und Pool-Auto-Claim uebergehen die Person). Zugang, Rolle und Historie bleiben unberuehrt.';

UPDATE public.benutzer_rollen
   SET nimmt_neue_bestellungen = false
 WHERE kuerzel = 'MT';
