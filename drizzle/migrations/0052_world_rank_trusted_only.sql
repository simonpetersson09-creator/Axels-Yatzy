CREATE OR REPLACE FUNCTION public.get_world_rank(p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_games integer;
  v_rank bigint;
  v_total bigint;
BEGIN
  -- Only real players: at least one match, claimed device, anti-cheat filters
  -- (same source as the country leaderboard).
  WITH t AS (
    SELECT t.session_id, t.games_played, s.created_at
    FROM public.trusted_country_stats() t
    JOIN public.player_country_stats s USING (session_id)
  ), r AS (
    SELECT session_id, games_played,
      ROW_NUMBER() OVER (ORDER BY games_played DESC, created_at ASC) AS rank,
      COUNT(*) OVER () AS total
    FROM t
  )
  SELECT games_played, rank, total INTO v_games, v_rank, v_total
  FROM r WHERE session_id = p_session_id;

  IF v_games IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object('found', true, 'games_played', v_games, 'rank', v_rank, 'total', v_total);
END;
$$;