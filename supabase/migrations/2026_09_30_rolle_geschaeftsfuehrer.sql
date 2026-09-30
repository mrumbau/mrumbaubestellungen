-- 30.09.2026 — Neue Rolle: Geschaeftsfuehrung.
--
-- Anlass: CR fuehrt die Firma und soll fachlich alles verwalten duerfen —
-- Haendler anlegen und loeschen, Blacklist, Benutzerverwaltung, den ganzen
-- System-Bereich. Nicht aber Testdaten erzeugen und keine DSGVO-Loeschung;
-- das sind die beiden Stellen, an denen ein Fehlgriff nicht zurueckzuholen
-- ist, und sie haben mit Geschaeftsfuehrung nichts zu tun.
--
-- Warum eine eigene Rolle und nicht einfach Admin:
-- Admin-Konten koennen seit dem 09.06.2026 nicht Eigentuemer einer Bestellung
-- sein — sonst landen Bestellungen beim IT-Support statt bei den Leuten, die
-- wirklich bestellen. CR hat 115 Bestellungen, davon 46 offene, und ist seit
-- Marlons Weggang der einzige aktive Besteller. Ein Admin-Konto fuer CR haette
-- ihn aus jedem Zuordnen-Menue entfernt und den Pool unbenutzbar gemacht.
ALTER TABLE public.benutzer_rollen
  DROP CONSTRAINT IF EXISTS benutzer_rollen_rolle_check;

ALTER TABLE public.benutzer_rollen
  ADD CONSTRAINT benutzer_rollen_rolle_check
  CHECK (rolle = ANY (ARRAY['besteller', 'buchhaltung', 'admin', 'geschaeftsfuehrer']));

-- Zugriffsregeln.
--
-- 56 der 62 Regeln, die auf 'admin' pruefen, tun das ueber get_user_rolle().
-- Sie alle meinen dasselbe: "darf verwalten". Es gibt keine einzige Regel, bei
-- der ein Admin hinein- und die Geschaeftsfuehrung hinausgehoeren wuerde — die
-- beiden Ausnahmen (Testdaten, DSGVO-Loeschung) sind Aktionen in der
-- Anwendung, nicht Datenbestaende, und werden dort streng geprueft.
--
-- Deshalb wird die Rolle hier auf 'admin' abgebildet, statt 56 Regeln
-- einzeln umzuschreiben. Das ist ausdruecklich die sicherere Variante: jede
-- der 56 Regeln von Hand neu zu formulieren haette 56 Gelegenheiten
-- geschaffen, eine Zugriffsregel still falsch zu machen.
--
-- Was das heisst, klar gesagt: auf Datenbankebene ist die Geschaeftsfuehrung
-- ein Admin. Der Unterschied lebt in der Anwendung. Die echte Rolle steht
-- unveraendert in benutzer_rollen.rolle, und von dort liest sie die App.
CREATE OR REPLACE FUNCTION public.get_user_rolle()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
           WHEN rolle = 'geschaeftsfuehrer' THEN 'admin'
           ELSE rolle
         END
    FROM benutzer_rollen
   WHERE user_id = auth.uid()
   LIMIT 1;
$function$;

COMMENT ON FUNCTION public.get_user_rolle() IS
  'Rolle fuer die Zugriffsregeln. Bildet geschaeftsfuehrer auf admin ab, weil alle 56 Regeln, die auf admin pruefen, "darf verwalten" meinen. Die echte Rolle steht in benutzer_rollen.rolle — diese Funktion NICHT benutzen, um die Rolle anzuzeigen oder fachlich zu entscheiden.';
