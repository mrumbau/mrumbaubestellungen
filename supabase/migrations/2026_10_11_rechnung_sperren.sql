-- Rechnung sperren mit Grund (11.10.2026)
--
-- Warum: Eine Rechnung kann strittig sein (beim Anwalt, falsch, doppelt).
-- Bis heute gab es dafuer nur "verwerfen" — das loescht den Vorgang samt
-- Belegen. Gebraucht wird eine Sperre, die den Vorgang stehen laesst, aber
-- Freigabe und Bezahlung verhindert, mit sichtbarem Grund und Urheber.
--
-- Die Sperre liegt quer zum Status: eine gesperrte Bestellung behaelt ihren
-- Status (vollstaendig, abweichung, auch freigegeben), nur die beiden
-- Geld-Aktionen sind blockiert. So bleibt die Status-Maschine unberuehrt.

ALTER TABLE public.bestellungen
  ADD COLUMN IF NOT EXISTS gesperrt_am timestamptz,
  ADD COLUMN IF NOT EXISTS gesperrt_von text,
  ADD COLUMN IF NOT EXISTS sperrgrund text;

COMMENT ON COLUMN public.bestellungen.gesperrt_am IS 'Rechnung gesperrt seit; NULL = nicht gesperrt. Blockiert Freigabe und Bezahlt-Markierung.';
COMMENT ON COLUMN public.bestellungen.gesperrt_von IS 'Kuerzel, wer die Sperre gesetzt hat.';
COMMENT ON COLUMN public.bestellungen.sperrgrund IS 'Grund der Sperre, Pflicht beim Sperren.';

-- Gesperrte Vorgaenge sind wenige; der Teilindex macht Listen-Filter billig.
CREATE INDEX IF NOT EXISTS idx_bestellungen_gesperrt
  ON public.bestellungen (gesperrt_am)
  WHERE gesperrt_am IS NOT NULL;

-- Die Freigabe-Funktion verweigert bei Sperre. Das ist die letzte Linie:
-- API-Routen, Server-Action und Mail-Reply pruefen vorher, aber nur die
-- Funktion sieht jeden Aufrufer.
CREATE OR REPLACE FUNCTION public.freigeben_bestellung(
  p_bestellung_id uuid,
  p_kuerzel text,
  p_name text,
  p_kommentar text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  freigabe_id UUID;
  rows_updated INTEGER;
  v_sperrgrund TEXT;
BEGIN
  -- 11.10.2026 — gesperrte Rechnung: keine Freigabe, egal von wem.
  SELECT sperrgrund INTO v_sperrgrund
  FROM bestellungen
  WHERE id = p_bestellung_id AND gesperrt_am IS NOT NULL;

  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'gesperrt', 'sperrgrund', v_sperrgrund);
  END IF;

  -- Status atomar setzen (nur wenn noch nicht freigegeben)
  UPDATE bestellungen
  SET status = 'freigegeben', updated_at = NOW()
  WHERE id = p_bestellung_id AND status != 'freigegeben' AND gesperrt_am IS NULL;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;

  IF rows_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'bereits_freigegeben');
  END IF;

  -- Freigabe-Eintrag erstellen (Unique Constraint verhindert Duplikate)
  INSERT INTO freigaben (bestellung_id, freigegeben_von_kuerzel, freigegeben_von_name, kommentar)
  VALUES (p_bestellung_id, p_kuerzel, p_name, p_kommentar)
  RETURNING id INTO freigabe_id;

  RETURN jsonb_build_object('success', true, 'freigabe_id', freigabe_id);
EXCEPTION
  WHEN unique_violation THEN
    -- Doppelklick: Freigabe existiert bereits, das ist OK
    RETURN jsonb_build_object('success', true, 'duplicate', true);
  WHEN OTHERS THEN
    -- Rollback: Status zuruecksetzen wenn Insert fehlschlaegt
    UPDATE bestellungen SET status = 'vollstaendig' WHERE id = p_bestellung_id AND status = 'freigegeben';
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$fn$;
