-- Migration: Defense-in-Depth für increment_mahnung (09.06.2026)
-- ------------------------------------------------------------------
-- Wurzel:
--   classify-logic (TS) prüfte vor dem RPC-Call:
--     hat_rechnung=true, bezahlt_am IS NULL, status NOT IN terminal,
--     keine Doku mit bezahlt_bereits=true.
--   Race-Condition möglich: Query findet eine Bestellung als „mahnbar",
--   in der Zwischenzeit wird Rechnung gelöscht / bezahlt_am gesetzt /
--   PayPal-Doku als bezahlt erkannt, RPC läuft trotzdem und erhöht den
--   Counter.
--
--   Ausserdem: ein Direkt-Aufruf der RPC (z.B. aus einem Test, Cron, oder
--   Migration) konnte die Defensive komplett umgehen.
--
-- Fix:
--   increment_mahnung prüft jetzt server-seitig dieselben Bedingungen wie
--   classify-logic. Wenn nicht erfüllt → return current mahnung_count
--   OHNE Increment. Logik ist idempotent: der Caller bekommt einen
--   sinnvollen Rückgabewert (die Stufe bleibt gleich) und kann nichts
--   missverstehen.
--
-- Ausführung:
--   Supabase Dashboard → SQL Editor → Run
--   ODER `supabase migration up`
--
-- Risiko: Niedrig. CREATE OR REPLACE überschreibt die existierende
--   Funktion; alle Caller bleiben kompatibel (Signatur + Return-Typ
--   unverändert). Defensive ist additiv — nichts wird in den existierenden
--   Daten verändert.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION increment_mahnung(p_bestellung_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_count   INTEGER;
  v_hat_rechnung    BOOLEAN;
  v_bezahlt_am      TIMESTAMPTZ;
  v_status          TEXT;
  v_paypal_doku     BOOLEAN;
BEGIN
  -- 1) Aktuellen Zustand der Bestellung laden (mit Row-Lock)
  SELECT mahnung_count, hat_rechnung, bezahlt_am, status
    INTO v_current_count, v_hat_rechnung, v_bezahlt_am, v_status
    FROM bestellungen
   WHERE id = p_bestellung_id
   FOR UPDATE;

  -- Bestellung existiert nicht → 0 zurück, kein Fehler
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- 2) Defense-in-Depth: Mahnung nicht erhöhen wenn ...
  --   a) Bestellung hat keine Rechnung
  IF NOT COALESCE(v_hat_rechnung, FALSE) THEN
    RETURN COALESCE(v_current_count, 0);
  END IF;

  --   b) Bestellung ist manuell als bezahlt markiert
  IF v_bezahlt_am IS NOT NULL THEN
    RETURN COALESCE(v_current_count, 0);
  END IF;

  --   c) Bestellung ist in einem terminalen Status
  IF v_status IN ('freigegeben', 'verworfen', 'storniert') THEN
    RETURN COALESCE(v_current_count, 0);
  END IF;

  --   d) Irgendeine Rechnung der Bestellung wurde KI-seitig als bereits
  --      bezahlt erkannt (PayPal/Vorkasse). bezahlt_bereits ist eine
  --      dokumente-Spalte, daher EXISTS gegen dokumente.
  SELECT EXISTS (
    SELECT 1
      FROM dokumente d
     WHERE d.bestellung_id = p_bestellung_id
       AND d.typ = 'rechnung'
       AND d.bezahlt_bereits = TRUE
  ) INTO v_paypal_doku;

  IF v_paypal_doku THEN
    RETURN COALESCE(v_current_count, 0);
  END IF;

  --   e) Sanity-Cap bei 10 (Datenmüll-Schutz, redundant mit TS-Check)
  IF COALESCE(v_current_count, 0) >= 10 THEN
    RETURN COALESCE(v_current_count, 0);
  END IF;

  -- 3) Alle Bedingungen erfüllt → echter Increment
  UPDATE bestellungen
     SET mahnung_count = COALESCE(mahnung_count, 0) + 1,
         mahnung_am    = NOW(),
         updated_at    = NOW()
   WHERE id = p_bestellung_id
   RETURNING mahnung_count INTO v_current_count;

  RETURN v_current_count;
END;
$$;

-- Hinweis: GRANTs bleiben wie vorher (service_role + authenticated, je nach
-- Setup). CREATE OR REPLACE ändert keine Berechtigungen, die existierten.
-- Falls explizit gesetzt werden soll:
--   GRANT EXECUTE ON FUNCTION increment_mahnung(UUID) TO authenticated;
--   GRANT EXECUTE ON FUNCTION increment_mahnung(UUID) TO service_role;

-- Verifikations-Queries (manuell nach Migration):
--
-- 1. Funktion blockt fehlende Rechnung:
--    -- Bestellung ohne Rechnung anlegen, count=0
--    -- SELECT increment_mahnung('<id>'); → erwartet 0
--    -- SELECT mahnung_count FROM bestellungen WHERE id='<id>'; → erwartet NULL/0
--
-- 2. Funktion blockt PayPal-Bezahlt:
--    -- Bestellung mit Rechnung + Doku.bezahlt_bereits=true anlegen
--    -- SELECT increment_mahnung('<id>'); → erwartet aktuellen count
--    -- mahnung_count + mahnung_am bleiben unverändert
--
-- 3. Normaler Fall feuert:
--    -- Bestellung mit Rechnung, hat_rechnung=true, status='offen', nicht bezahlt
--    -- SELECT increment_mahnung('<id>'); → erwartet count+1
