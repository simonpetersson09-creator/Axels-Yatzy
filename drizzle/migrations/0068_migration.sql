CREATE OR REPLACE FUNCTION public.internal_anon_number(p_session text)
RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE h bigint := 0; i int;
BEGIN
  FOR i IN 1..length(p_session) LOOP
    h := (h * 31 + ascii(substr(p_session, i, 1))) % 4294967296;
  END LOOP;
  RETURN 1000 + (h % 9000)::int;
END $$;

CREATE OR REPLACE FUNCTION public.get_weekly_hall_of_fame(p_limit integer DEFAULT 10)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'session_id', session_id,
    'name', CASE WHEN dup > 1 THEN first_name || ' ' || public.internal_anon_number(session_id) ELSE first_name END,
    'country', country, 'best_score', best_score, 'games_played', games_played)
    ORDER BY best_score DESC, best_at ASC), '[]'::jsonb)
  FROM (
    SELECT t.*, count(*) OVER (PARTITION BY lower(first_name)) AS dup FROM (
      SELECT * FROM public.weekly_hall_of_fame
      WHERE week_start = public.internal_hof_week() AND best_score > 0
      ORDER BY best_score DESC, best_at ASC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50)) t
  ) x
$function$;

CREATE OR REPLACE FUNCTION public.get_weekly_most_games(p_limit integer DEFAULT 10)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'session_id', session_id,
    'name', CASE WHEN dup > 1 THEN first_name || ' ' || public.internal_anon_number(session_id) ELSE first_name END,
    'country', country, 'best_score', best_score, 'games_played', games_played)
    ORDER BY games_played DESC, best_score DESC, updated_at ASC), '[]'::jsonb)
  FROM (
    SELECT t.*, count(*) OVER (PARTITION BY lower(first_name)) AS dup FROM (
      SELECT * FROM public.weekly_hall_of_fame
      WHERE week_start = public.internal_hof_week() AND games_played > 0
      ORDER BY games_played DESC, best_score DESC, updated_at ASC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50)) t
  ) x
$function$;