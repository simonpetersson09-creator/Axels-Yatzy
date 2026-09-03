CREATE OR REPLACE FUNCTION public.get_world_leader()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_country text;
  v_games integer;
BEGIN
  SELECT
    country,
    COALESCE(SUM(games_played), 0)::int
  INTO v_country, v_games
  FROM public.player_country_stats
  GROUP BY country
  ORDER BY SUM(games_played) DESC
  LIMIT 1;

  IF v_country IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'country', v_country,
    'games_played', v_games
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_world_leader() TO anon, authenticated;