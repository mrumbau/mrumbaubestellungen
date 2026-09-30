-- 21.09.2026 — Gegenstueck zum nimmt_neue_bestellungen-Flag.
--
-- pool_auto_claim_cron() weist Pool-Bestellungen automatisch dem
-- vorschlag_kuerzel zu, sobald die Konfidenz ueber dem Schwellwert liegt.
-- Ohne diesen Zusatz wuerde der Job weiter an MT zuweisen, obwohl die
-- Pipeline ihn inzwischen uebergeht — der Vorschlag stammt ja aus derselben
-- Historie.
--
-- Einzige Aenderung gegenueber der Vorversion: der EXISTS-Block am Ende der
-- WHERE-Klausel. Alles andere ist unveraendert uebernommen.
CREATE OR REPLACE FUNCTION public.pool_auto_claim_cron()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_enabled    boolean;
  v_threshold  numeric;
  v_methods    text[];
  v_candidate  record;
  v_count      int := 0;
  v_result     jsonb;
BEGIN
  SELECT (wert ILIKE 'true') INTO v_enabled
    FROM firma_einstellungen WHERE schluessel='pool_auto_claim_enabled' LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(NULLIF(wert,'')::numeric, 0.95) INTO v_threshold
    FROM firma_einstellungen WHERE schluessel='pool_auto_claim_threshold' LIMIT 1;
  v_threshold := COALESCE(v_threshold, 0.95);

  SELECT string_to_array(COALESCE(NULLIF(wert,''), 'besteller_im_dokument'), ',') INTO v_methods
    FROM firma_einstellungen WHERE schluessel='pool_auto_claim_methods' LIMIT 1;
  v_methods := COALESCE(v_methods, ARRAY['besteller_im_dokument']);
  v_methods := ARRAY(SELECT TRIM(e) FROM unnest(v_methods) e);

  FOR v_candidate IN
    SELECT b.id,
           b.vorschlag_kuerzel,
           b.vorschlag_konfidenz,
           COALESCE(NULLIF(b.zuordnung_methode,''), 'unbekannt') AS methode
      FROM public.bestellungen b
     WHERE b.besteller_kuerzel = 'UNBEKANNT'
       AND b.bestellungsart = 'material'
       AND b.archiviert_am IS NULL
       AND b.status NOT IN ('freigegeben')
       AND b.vorschlag_kuerzel IS NOT NULL
       AND b.vorschlag_kuerzel <> 'UNBEKANNT'
       AND b.vorschlag_konfidenz IS NOT NULL
       AND b.vorschlag_konfidenz >= v_threshold
       AND COALESCE(NULLIF(b.zuordnung_methode,''),'unbekannt') = ANY (v_methods)
       -- 21.09.2026 — niemandem zuweisen, der keine neuen Bestellungen
       -- mehr annimmt. Unbekannte Kuerzel bleiben zulaessig (fail-open),
       -- damit ein fehlender Stammsatz den Auto-Claim nicht lahmlegt.
       AND NOT EXISTS (
             SELECT 1 FROM public.benutzer_rollen r
              WHERE r.kuerzel = b.vorschlag_kuerzel
                AND r.nimmt_neue_bestellungen = false
           )
     LIMIT 100
  LOOP
    v_result := public.pool_auto_claim_bestellung(
      v_candidate.id,
      v_candidate.vorschlag_kuerzel,
      jsonb_build_object(
        'source', 'cron',
        'methode', v_candidate.methode,
        'konfidenz', v_candidate.vorschlag_konfidenz,
        'threshold', v_threshold
      )
    );
    IF (v_result->>'success')::boolean THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$function$;
