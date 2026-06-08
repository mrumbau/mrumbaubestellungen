-- Migration: PayPal-Payment-Detection auf Rechnungen (03.06.2026)
-- ------------------------------------------------------------------
-- Zweck: KI erkennt bei Rechnungs-Analyse ob die Rechnung bereits per
-- PayPal/Vorkasse/etc. beglichen wurde. Wenn ja: dokumente.bezahlt_am
-- wird automatisch beim Persist gesetzt — NJ muss nicht mehr klicken.
--
-- WICHTIG: NUR bei EINDEUTIGEN Formulierungen wie "Mit PayPal bezahlt",
-- "Zahlung per PayPal erhalten", "Betrag dankend erhalten". NICHT bei
-- "Zahlbar via PayPal innerhalb 14 Tagen" oder ähnlichen Zahlungs-
-- aufforderungen (siehe Prompt-Logik im Code).
--
-- Ausführung:
--   - Supabase Dashboard → SQL Editor → Run
--   - ODER `supabase migration up` wenn CLI installiert
-- ------------------------------------------------------------------

-- 1. Neue Spalten auf dokumente
ALTER TABLE dokumente
  ADD COLUMN IF NOT EXISTS bezahlt_bereits BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS zahlungsmethode TEXT;

-- Constraint: zahlungsmethode darf nur bekannte Werte annehmen
ALTER TABLE dokumente
  DROP CONSTRAINT IF EXISTS dokumente_zahlungsmethode_check;

ALTER TABLE dokumente
  ADD CONSTRAINT dokumente_zahlungsmethode_check
  CHECK (
    zahlungsmethode IS NULL
    OR zahlungsmethode IN (
      'paypal',
      'vorkasse',
      'kreditkarte',
      'lastschrift',
      'klarna',
      'stripe',
      'sofort',
      'ueberweisung',
      'andere'
    )
  );

-- 2. Partial Index für schnelles Filtern auf Auto-Erkannte
CREATE INDEX IF NOT EXISTS idx_dokumente_bezahlt_bereits
  ON dokumente(bezahlt_bereits)
  WHERE bezahlt_bereits = TRUE;

CREATE INDEX IF NOT EXISTS idx_dokumente_zahlungsmethode
  ON dokumente(zahlungsmethode)
  WHERE zahlungsmethode IS NOT NULL;

-- 3. Trigger: bei INSERT/UPDATE mit bezahlt_bereits=TRUE auf typ='rechnung'
--    → setze gleich bezahlt_am und bezahlt_von, falls noch null.
--    NJ kann das später manuell wieder zurücksetzen (Bezahlt-Toggle).
CREATE OR REPLACE FUNCTION auto_set_bezahlt_on_bereits()
RETURNS TRIGGER AS $$
BEGIN
  -- Nur Rechnungen
  IF NEW.typ <> 'rechnung' THEN
    RETURN NEW;
  END IF;

  -- Nur wenn KI eindeutig bereits-bezahlt erkannt hat
  IF NEW.bezahlt_bereits IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Nur wenn bezahlt_am noch leer (manuelles Setting nicht überschreiben)
  IF NEW.bezahlt_am IS NULL THEN
    NEW.bezahlt_am := NOW();
    NEW.bezahlt_von := 'Auto-erkannt'
      || COALESCE(' (' || NEW.zahlungsmethode || ')', '');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_auto_set_bezahlt_on_bereits ON dokumente;

CREATE TRIGGER trg_auto_set_bezahlt_on_bereits
  BEFORE INSERT OR UPDATE ON dokumente
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_bezahlt_on_bereits();

-- 4. RPC persist_dokument_atomic erweitern um die zwei neuen Parameter.
--    Backwards-compatible: defaults FALSE / NULL.
--    Die existing Function-Signatur wird via OVERLOAD ergänzt — die alte
--    bleibt, eine neue mit zwei zusätzlichen Optional-Args wird hinzugefügt.
--    Da Postgres aber bei Optional Params Function-Overload-Resolution
--    keine zwei Versionen mit gleichem Namen + Optional zulässt, machen
--    wir ALTER FUNCTION + neue Default-Spalten.
--
-- Die Pipeline-Caller können die neuen Felder direkt im SQL über
-- INSERT INTO dokumente (...) ... setzen — der Trigger oben handhabt
-- den bezahlt_am/von-Auto-Setting. Wir müssen die RPC nicht zwingend
-- ändern, weil:
--   a) persist_dokument_atomic schreibt erst INSERT, dann setzt die
--      Pipeline mit einem Folge-UPDATE die Bezahlt-Felder
--   b) Trigger feuert bei INSERT UND UPDATE → beides funktioniert
--
-- Falls die RPC die Felder direkt schreiben soll, wäre das Phase 2.
-- Heute: Pipeline-Code macht UPDATE nach persist_dokument_atomic-RPC.

-- 5. Event-Type erweitern (informational only — events-Tabelle hat
--    keinen CHECK-Constraint auf event_type, deshalb keine Schema-Änderung).
--    Neue Event-Type: 'auto_bezahlt_erkannt' wird vom Pipeline-Code
--    geschrieben wenn die Auto-Erkennung greift.

-- Verifikations-Queries (zum manuellen Testen nach Migration):
--   SELECT column_name, data_type, column_default
--     FROM information_schema.columns
--    WHERE table_name='dokumente'
--      AND column_name IN ('bezahlt_bereits', 'zahlungsmethode');
--
--   -- Sollte 2 Zeilen liefern.
