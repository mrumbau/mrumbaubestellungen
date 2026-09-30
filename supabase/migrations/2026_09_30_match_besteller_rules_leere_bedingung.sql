-- 30.09.2026 — Eine Regel ohne Bedingungen darf nicht alles zuweisen.
--
-- match_besteller_rules startet bei combiner = 'AND' mit v_combined = true
-- und verundet dann jede Bedingung. Ist die Bedingungsliste leer, bleibt
-- v_combined = true — die Regel trifft auf JEDE Mail zu und weist saemtliche
-- eingehenden Bestellungen derselben Person zu, lautlos und mit der
-- Konfidenz der Regel.
--
-- Die API laesst so etwas nicht durch (min(1) Bedingung), aber die Regel
-- steht in einer normalen Tabelle: ein Eintrag ueber das Supabase-Studio,
-- ein Tippfehler im JSON (`{"conditions": []}`) oder ein spaeterer
-- Import genuegt. Fuer einen derart teuren Fehler ist eine Zeile Schutz
-- in der Funktion selbst die richtige Stelle.
--
-- Zusaetzlich: unbekannte Bedingungstypen. Bisher galt ein Typ, den die
-- Funktion nicht kennt, schlicht als "nicht erfuellt". Bei UND heisst das
-- "Regel greift nie" — unangenehm, aber harmlos. Bei ODER heisst es, dass
-- ein Tippfehler in einem von drei Typen unbemerkt bleibt. Das aendert
-- diese Migration nicht, es ist hier nur festgehalten.
CREATE OR REPLACE FUNCTION public.match_besteller_rules(
  p_haendler_domain text,
  p_haendler_id uuid,
  p_email_absender text,
  p_email_betreff text,
  p_betrag numeric DEFAULT NULL::numeric,
  p_projekt_name text DEFAULT NULL::text
)
 RETURNS TABLE(rule_id uuid, target_kuerzel text, confidence numeric, rule_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_id          uuid;
  v_name        text;
  v_condition   jsonb;
  v_target      text;
  v_confidence  numeric;
  v_combiner    text;
  v_conds       jsonb;
  v_cond        jsonb;
  v_cond_type   text;
  v_cond_value  text;
  v_one_match   boolean;
  v_combined    boolean;
BEGIN
  FOR v_id, v_name, v_condition, v_target, v_confidence, v_combiner IN
    SELECT br.id, br.name, br.condition, br.target_kuerzel, br.confidence, br.combiner
      FROM public.besteller_rules br
     WHERE br.enabled = true
     ORDER BY br.priority ASC, br.created_at ASC
  LOOP
    IF v_condition ? 'conditions' THEN
      v_conds := v_condition->'conditions';
    ELSIF jsonb_typeof(v_condition) = 'array' THEN
      v_conds := v_condition;
    ELSE
      v_conds := jsonb_build_array(v_condition);
    END IF;

    -- Eine Regel ohne Bedingung beschreibt nichts und darf deshalb nichts
    -- treffen — weder bei UND noch bei ODER.
    IF v_conds IS NULL
       OR jsonb_typeof(v_conds) <> 'array'
       OR jsonb_array_length(v_conds) = 0 THEN
      CONTINUE;
    END IF;

    v_combined := (v_combiner = 'AND');

    FOR v_cond IN SELECT * FROM jsonb_array_elements(v_conds) LOOP
      v_cond_type  := v_cond->>'type';
      v_cond_value := v_cond->>'value';
      v_one_match  := false;

      IF v_cond_type = 'haendler_domain' THEN
        v_one_match := lower(COALESCE(p_haendler_domain,'')) = lower(v_cond_value);
      ELSIF v_cond_type = 'haendler_domain_contains' THEN
        v_one_match := lower(COALESCE(p_haendler_domain,'')) LIKE '%' || lower(v_cond_value) || '%';
      ELSIF v_cond_type = 'haendler_id' THEN
        v_one_match := p_haendler_id::text = v_cond_value;
      ELSIF v_cond_type = 'absender_pattern' THEN
        v_one_match := lower(COALESCE(p_email_absender,'')) ~ lower(v_cond_value);
      ELSIF v_cond_type = 'subject_keyword' THEN
        v_one_match := lower(COALESCE(p_email_betreff,'')) LIKE '%' || lower(v_cond_value) || '%';
      ELSIF v_cond_type = 'betrag_min' THEN
        v_one_match := p_betrag IS NOT NULL AND p_betrag >= v_cond_value::numeric;
      ELSIF v_cond_type = 'betrag_max' THEN
        v_one_match := p_betrag IS NOT NULL AND p_betrag <= v_cond_value::numeric;
      ELSIF v_cond_type = 'projekt_keyword' THEN
        v_one_match := lower(COALESCE(p_projekt_name,'')) LIKE '%' || lower(v_cond_value) || '%';
      END IF;

      IF v_combiner = 'AND' THEN
        v_combined := v_combined AND v_one_match;
        EXIT WHEN NOT v_combined;
      ELSE
        IF v_one_match THEN
          v_combined := true;
          EXIT;
        ELSE
          v_combined := false;
        END IF;
      END IF;
    END LOOP;

    IF v_combined AND v_target IS NOT NULL THEN
      UPDATE public.besteller_rules
         SET hit_count = hit_count + 1, last_hit_at = NOW()
       WHERE id = v_id;

      rule_id := v_id;
      target_kuerzel := v_target;
      confidence := v_confidence;
      rule_name := v_name;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;
END;
$function$;
