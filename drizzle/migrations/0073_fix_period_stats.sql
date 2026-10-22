-- 1) Remove the 1000-game cap: players with 1000+ total games got 0 in year/month stats
CREATE OR REPLACE FUNCTION public.trusted_country_stats()
 RETURNS TABLE(session_id text, country text, games_played integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.session_id,
    s.country,
    s.games_played::int AS games_played
  FROM public.player_country_stats s
  WHERE s.games_played > 0
    AND EXISTS (SELECT 1 FROM public.session_owners o WHERE o.session_id = s.session_id)
    AND s.updated_at >= s.created_at
    AND NOT (s.games_played > 5 AND s.updated_at - s.created_at < interval '10 minutes')
    AND NOT (
      s.games_played > 5
      AND s.games_played::numeric
          / GREATEST(EXTRACT(epoch FROM (s.updated_at - s.created_at)) / 86400.0, 0.5) > 200
    );
$function$;

CREATE OR REPLACE FUNCTION public.period_country_games(p_since date)
 RETURNS TABLE(session_id text, country text, games integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.session_id, t.country,
    GREATEST(t.games_played - COALESCE(
      (SELECT h.games_played FROM public.player_games_history h
        WHERE h.session_id = t.session_id AND h.day < p_since ORDER BY h.day DESC LIMIT 1),
      CASE WHEN (s.created_at AT TIME ZONE 'Europe/Stockholm')::date >= p_since THEN 0 END,
      (SELECT h.games_played FROM public.player_games_history h
        WHERE h.session_id = t.session_id ORDER BY h.day ASC LIMIT 1),
      0), 0)::int
  FROM public.trusted_country_stats() t
  JOIN public.player_country_stats s ON s.session_id = t.session_id;
$function$;

-- 2) Weekly rank: Stockholm dates instead of UTC, and new players (no history
--    before the window) keep their first matches instead of being zeroed out
CREATE OR REPLACE FUNCTION public.get_weekly_rank(p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rank bigint; v_total bigint; v_games integer;
  v_since date := (now() AT TIME ZONE 'Europe/Stockholm')::date - 7;
BEGIN
  WITH cur AS (
    SELECT s.session_id, s.games_played, s.created_at FROM public.player_country_stats s
  ),
  base AS (
    SELECT c.session_id,
      COALESCE(
        (SELECT h.games_played FROM public.player_games_history h
          WHERE h.session_id = c.session_id AND h.day <= v_since
          ORDER BY h.day DESC LIMIT 1),
        CASE WHEN (c.created_at AT TIME ZONE 'Europe/Stockholm')::date >= v_since THEN 0 END,
        (SELECT h.games_played FROM public.player_games_history h
          WHERE h.session_id = c.session_id ORDER BY h.day ASC LIMIT 1),
        0) AS base_games
    FROM cur c
  ),
  weekly AS (
    SELECT c.session_id, GREATEST(c.games_played - b.base_games, 0) AS w, c.created_at
    FROM cur c JOIN base b USING (session_id)
  ),
  ranked AS (
    SELECT session_id, w,
      ROW_NUMBER() OVER (ORDER BY w DESC, created_at ASC) AS rank,
      COUNT(*) OVER () AS total
    FROM weekly WHERE w > 0
  )
  SELECT rank, total, w INTO v_rank, v_total, v_games FROM ranked WHERE session_id = p_session_id;

  IF v_rank IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  RETURN jsonb_build_object('found', true, 'rank', v_rank, 'total', v_total, 'games_played', v_games);
END;
$function$;

-- 3) World leaders follow the calendar year (Stockholm), matching the
--    "Världsledare <year>" label on the home screen
CREATE OR REPLACE FUNCTION public.get_world_leaders()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cached jsonb;
  v_leaders jsonb;
  v_result jsonb;
BEGIN
  SELECT data INTO v_cached FROM world_leaders_cache
  WHERE id = 1 AND updated_at > now() - interval '60 seconds';
  IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('country', sub.country, 'games_played', sub.games_played) ORDER BY sub.ord
  ), '[]'::jsonb)
  INTO v_leaders
  FROM (
    SELECT t.country,
      COALESCE(SUM(t.games), 0)::int AS games_played,
      ROW_NUMBER() OVER (ORDER BY SUM(t.games) DESC) AS ord
    FROM public.period_country_games(public.period_start('year')) t
    GROUP BY t.country
    HAVING SUM(t.games) > 0
    ORDER BY SUM(t.games) DESC
    LIMIT 3
  ) sub;

  IF jsonb_array_length(v_leaders) = 0 THEN
    v_result := jsonb_build_object('found', false, 'leaders', '[]'::jsonb);
  ELSE
    v_result := jsonb_build_object('found', true, 'leaders', v_leaders);
  END IF;

  INSERT INTO world_leaders_cache (id, data, updated_at) VALUES (1, v_result, now())
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;
  RETURN v_result;
END;
$function$;