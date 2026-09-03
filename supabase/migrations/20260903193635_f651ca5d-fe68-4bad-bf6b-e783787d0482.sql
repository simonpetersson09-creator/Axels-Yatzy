CREATE OR REPLACE FUNCTION public.get_world_leaders()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_leaders jsonb;
BEGIN
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'country', sub.country,
        'games_played', sub.games_played
      )
      ORDER BY sub.ord
    ), '[]'::jsonb)
  INTO v_leaders
  FROM (
    SELECT
      country,
      COALESCE(SUM(games_played), 0)::int AS games_played,
      ROW_NUMBER() OVER (ORDER BY SUM(games_played) DESC) AS ord
    FROM public.player_country_stats
    GROUP BY country
    ORDER BY SUM(games_played) DESC
    LIMIT 3
  ) sub;

  IF jsonb_array_length(v_leaders) = 0 THEN
    RETURN jsonb_build_object('found', false, 'leaders', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object('found', true, 'leaders', v_leaders);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_world_leaders() TO anon, authenticated;