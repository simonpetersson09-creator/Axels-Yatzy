CREATE INDEX IF NOT EXISTS idx_player_country_stats_games
  ON public.player_country_stats (games_played DESC);

CREATE OR REPLACE FUNCTION public.get_world_rank(p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_games integer;
  v_better integer;
  v_total integer;
BEGIN
  SELECT games_played INTO v_games
  FROM public.player_country_stats
  WHERE session_id = p_session_id;

  IF v_games IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT count(*) INTO v_better
  FROM public.player_country_stats
  WHERE games_played > v_games;

  SELECT count(*) INTO v_total
  FROM public.player_country_stats;

  RETURN jsonb_build_object(
    'found', true,
    'games_played', v_games,
    'rank', v_better + 1,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_world_rank(text) TO anon, authenticated;