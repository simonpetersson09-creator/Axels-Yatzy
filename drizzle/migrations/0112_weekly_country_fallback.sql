DO $migration$
DECLARE
  v_name text;
  v_oid oid;
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['get_weekly_hall_of_fame', 'get_weekly_most_games'] LOOP
    SELECT p.oid INTO STRICT v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=v_name;
    v_definition := pg_get_functiondef(v_oid);
    v_old := '''country'',country,''best_score''';
    v_new := '''country'',COALESCE(NULLIF(country, ''''), (SELECT c.country FROM public.player_country_stats c WHERE c.session_id=x.session_id)),''best_score''';
    IF strpos(v_definition,v_old)=0 THEN RAISE EXCEPTION 'Unexpected definition for %',v_name; END IF;
    EXECUTE replace(v_definition,v_old,v_new);
  END LOOP;
  SELECT p.oid INTO STRICT v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='report_weekly_score';
  v_definition := pg_get_functiondef(v_oid);
  v_old := 'IF v_name = '''' THEN v_name := ''Spelare''; END IF;';
  v_new := v_old || E'\n  IF v_country IS NULL THEN\n    SELECT c.country INTO v_country FROM public.player_country_stats c WHERE c.session_id=p_session_id;\n  END IF;';
  IF strpos(v_definition,v_old)=0 THEN RAISE EXCEPTION 'Unexpected report_weekly_score definition'; END IF;
  EXECUTE replace(v_definition,v_old,v_new);
END
$migration$;