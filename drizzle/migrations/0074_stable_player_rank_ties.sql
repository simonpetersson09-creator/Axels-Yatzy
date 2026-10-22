DO $migration$
DECLARE
  v_name text;
  v_signature regprocedure;
  v_definition text;
  v_updated text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['get_country_rank', 'get_world_rank', 'get_year_ranks', 'get_weekly_rank'] LOOP
    v_signature := ('public.' || v_name || '(text)')::regprocedure;
    v_definition := pg_get_functiondef(v_signature);
    v_updated := replace(v_definition, 'ORDER BY games_played DESC, created_at ASC)', 'ORDER BY games_played DESC, created_at ASC, session_id ASC)');
    v_updated := replace(v_updated, 'ORDER BY games DESC, created_at ASC)', 'ORDER BY games DESC, created_at ASC, session_id ASC)');
    v_updated := replace(v_updated, 'ORDER BY w DESC, created_at ASC)', 'ORDER BY w DESC, created_at ASC, session_id ASC)');
    IF v_updated = v_definition THEN
      RAISE EXCEPTION 'Expected ranking order not found in %', v_name;
    END IF;
    EXECUTE v_updated;
  END LOOP;
END;
$migration$;