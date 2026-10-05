CREATE TABLE public.player_games_history (
  session_id text NOT NULL,
  day date NOT NULL,
  games_played integer NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, day)
);
GRANT ALL ON public.player_games_history TO service_role;
ALTER TABLE public.player_games_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no direct access to games history" ON public.player_games_history FOR SELECT USING (false);

-- Seed today's snapshot from current totals so weekly progress starts counting now.
INSERT INTO public.player_games_history (session_id, day, games_played)
SELECT session_id, current_date, games_played FROM public.player_country_stats
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.upsert_player_country_stats(p_session_id text, p_country text, p_games_played integer, p_device_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_games integer := LEAST(GREATEST(COALESCE(p_games_played, 0), 0), 100000);
BEGIN
  IF NOT public.claim_session(p_session_id, p_device_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.player_country_stats (session_id, country, games_played, updated_at, created_at)
  VALUES (p_session_id, upper(left(p_country, 2)), v_games, now(), now())
  ON CONFLICT (session_id) DO UPDATE
  SET country = EXCLUDED.country,
      games_played = EXCLUDED.games_played,
      updated_at = now();

  INSERT INTO public.player_games_history (session_id, day, games_played)
  VALUES (p_session_id, current_date, v_games)
  ON CONFLICT (session_id, day) DO UPDATE SET games_played = EXCLUDED.games_played;
END;
$function$;

-- Weekly rank: matches played over the last 7 days, among players active this week.
CREATE OR REPLACE FUNCTION public.get_weekly_rank(p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rank bigint; v_total bigint; v_games integer;
BEGIN
  WITH cur AS (
    SELECT s.session_id, s.games_played, s.created_at FROM public.player_country_stats s
  ),
  base AS (
    SELECT c.session_id,
      COALESCE(
        (SELECT h.games_played FROM public.player_games_history h
          WHERE h.session_id = c.session_id AND h.day <= current_date - 7
          ORDER BY h.day DESC LIMIT 1),
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
    FROM weekly WHERE w > 0 OR session_id = p_session_id
  )
  SELECT rank, total, w INTO v_rank, v_total, v_games FROM ranked WHERE session_id = p_session_id;

  IF v_rank IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  RETURN jsonb_build_object('found', true, 'rank', v_rank, 'total', v_total, 'games_played', v_games);
END;
$function$;

-- Top countries, same trusted source as the home screen leaders.
CREATE OR REPLACE FUNCTION public.get_top_countries(p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('country', country, 'games_played', g, 'players', p) ORDER BY g DESC), '[]'::jsonb)
  FROM (
    SELECT t.country, SUM(t.games_played)::int AS g, COUNT(*)::int AS p
    FROM public.trusted_country_stats() t
    GROUP BY t.country
    ORDER BY SUM(t.games_played) DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50)
  ) x;
$function$;

GRANT EXECUTE ON FUNCTION public.get_weekly_rank(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_countries(integer) TO anon, authenticated;