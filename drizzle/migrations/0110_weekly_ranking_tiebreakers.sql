DO $migration$
DECLARE v_definition text;
BEGIN
 SELECT pg_get_functiondef('public.get_weekly_hall_of_fame(integer)'::regprocedure) INTO v_definition;
 v_definition := replace(v_definition,'ORDER BY best_score DESC,best_at ASC','ORDER BY best_score DESC,games_played DESC,best_at ASC,session_id ASC');
 EXECUTE v_definition;
 SELECT pg_get_functiondef('public.get_weekly_most_games(integer)'::regprocedure) INTO v_definition;
 v_definition := replace(v_definition,'ORDER BY games_played DESC,best_score DESC,updated_at ASC','ORDER BY games_played DESC,best_score DESC,updated_at ASC,session_id ASC');
 EXECUTE v_definition;
 SELECT pg_get_functiondef('public.internal_settle_weekly_rewards()'::regprocedure) INTO v_definition;
 IF position('ORDER BY best_score DESC,best_at ASC,session_id ASC' in v_definition)=0 THEN RAISE EXCEPTION 'Unexpected weekly reward ordering'; END IF;
 v_definition := replace(v_definition,'ORDER BY best_score DESC,best_at ASC,session_id ASC','ORDER BY best_score DESC,games_played DESC,best_at ASC,session_id ASC');
 EXECUTE v_definition;
END $migration$;
CREATE OR REPLACE FUNCTION public.internal_hof_rank(p_session_id text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
 SELECT rank FROM (
 SELECT session_id,row_number() OVER (ORDER BY best_score DESC,games_played DESC,best_at ASC,session_id ASC)::integer AS rank
 FROM public.weekly_hall_of_fame
 WHERE week_start=public.internal_hof_week() AND best_score>0
 ) ranked WHERE session_id=p_session_id;
$function$;