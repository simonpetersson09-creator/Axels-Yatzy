CREATE OR REPLACE FUNCTION public.period_country_games(p_since date)
RETURNS TABLE(session_id text, country text, games integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT t.session_id, t.country,
    GREATEST(t.games_played - LEAST(COALESCE(
      (SELECT h.games_played FROM public.player_games_history h
        WHERE h.session_id = t.session_id AND h.day < p_since ORDER BY h.day DESC LIMIT 1),
      CASE WHEN (s.created_at AT TIME ZONE 'Europe/Stockholm')::date >= p_since THEN 0 END,
      (SELECT h.games_played FROM public.player_games_history h
        WHERE h.session_id = t.session_id ORDER BY h.day ASC LIMIT 1),
      0), 1000), 0)::int
  FROM public.trusted_country_stats() t
  JOIN public.player_country_stats s ON s.session_id = t.session_id;
$$;
REVOKE ALL ON FUNCTION public.period_country_games(date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.period_start(p_period text)
RETURNS date LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT CASE WHEN p_period = 'month'
    THEN date_trunc('month', now() AT TIME ZONE 'Europe/Stockholm')::date
    ELSE date_trunc('year', now() AT TIME ZONE 'Europe/Stockholm')::date END;
$$;

CREATE OR REPLACE FUNCTION public.get_world_leaders()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_cached jsonb; v_leaders jsonb; v_result jsonb; v_year int := extract(year FROM now() AT TIME ZONE 'Europe/Stockholm')::int;
BEGIN
  SELECT data INTO v_cached FROM world_leaders_cache
  WHERE id = 1 AND updated_at > now() - interval '60 seconds' AND (data->>'year')::int = v_year;
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('country', sub.country, 'games_played', sub.g) ORDER BY sub.g DESC), '[]'::jsonb)
  INTO v_leaders
  FROM (SELECT p.country, SUM(p.games)::int g FROM public.period_country_games(public.period_start('year')) p
        GROUP BY p.country HAVING SUM(p.games) > 0 ORDER BY SUM(p.games) DESC LIMIT 3) sub;

  v_result := jsonb_build_object('found', jsonb_array_length(v_leaders) > 0, 'leaders', v_leaders, 'year', v_year);
  INSERT INTO world_leaders_cache (id, data, updated_at) VALUES (1, v_result, now())
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;
  RETURN v_result;
END;
$$;

DROP FUNCTION IF EXISTS public.get_top_countries(integer);
CREATE FUNCTION public.get_top_countries(p_limit integer DEFAULT 10, p_period text DEFAULT 'all')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('country', country, 'games_played', g, 'players', p) ORDER BY g DESC), '[]'::jsonb)
  FROM (
    SELECT x.country, SUM(x.games)::int g, COUNT(*) FILTER (WHERE x.games > 0)::int p
    FROM (
      SELECT t.country, t.games_played AS games FROM public.trusted_country_stats() t WHERE p_period NOT IN ('year','month')
      UNION ALL
      SELECT c.country, c.games FROM public.period_country_games(public.period_start(p_period)) c WHERE p_period IN ('year','month')
    ) x
    GROUP BY x.country HAVING SUM(x.games) > 0
    ORDER BY SUM(x.games) DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50)
  ) y;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_countries(integer, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_year_games(p_session_id text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT games FROM public.period_country_games(public.period_start('year')) WHERE session_id = p_session_id), 0);
$$;
GRANT EXECUTE ON FUNCTION public.get_my_year_games(text) TO anon, authenticated;