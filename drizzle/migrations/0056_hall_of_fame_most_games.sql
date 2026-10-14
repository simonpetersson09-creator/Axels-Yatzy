CREATE INDEX IF NOT EXISTS weekly_hall_of_fame_week_games_idx ON public.weekly_hall_of_fame (week_start, games_played DESC, updated_at);

CREATE OR REPLACE FUNCTION public.get_weekly_most_games(p_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'session_id', session_id, 'name', first_name, 'country', country,
    'best_score', best_score, 'games_played', games_played) ORDER BY games_played DESC, best_score DESC, updated_at ASC), '[]'::jsonb)
  FROM (
    SELECT * FROM public.weekly_hall_of_fame
    WHERE week_start = public.internal_hof_week() AND games_played > 0
    ORDER BY games_played DESC, best_score DESC, updated_at ASC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50)
  ) t
$$;
GRANT EXECUTE ON FUNCTION public.get_weekly_most_games(integer) TO anon, authenticated;