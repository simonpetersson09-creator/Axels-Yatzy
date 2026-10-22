CREATE OR REPLACE FUNCTION public.get_year_ranks(p_session_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH g AS (
    SELECT p.session_id, p.country, p.games, s.created_at
    FROM public.period_country_games(public.period_start('year')) p
    JOIN public.player_country_stats s ON s.session_id = p.session_id
    WHERE p.games > 0
  ), r AS (
    SELECT session_id, country, games,
      ROW_NUMBER() OVER (ORDER BY games DESC, created_at ASC) AS world_rank,
      COUNT(*) OVER () AS world_total,
      ROW_NUMBER() OVER (PARTITION BY country ORDER BY games DESC, created_at ASC) AS country_rank,
      COUNT(*) OVER (PARTITION BY country) AS country_total
    FROM g
  )
  SELECT COALESCE((SELECT jsonb_build_object('found', true, 'country', country, 'games_played', games,
      'world_rank', world_rank, 'world_total', world_total, 'country_rank', country_rank, 'country_total', country_total)
    FROM r WHERE session_id = p_session_id), jsonb_build_object('found', false));
$$;
GRANT EXECUTE ON FUNCTION public.get_year_ranks(text) TO anon, authenticated;