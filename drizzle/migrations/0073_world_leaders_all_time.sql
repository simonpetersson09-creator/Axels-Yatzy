-- Home screen world leaders: back to all time (the yearly lists live on the stats page).
CREATE OR REPLACE FUNCTION public.get_world_leaders()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
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
      COALESCE(SUM(t.games_played), 0)::int AS games_played,
      ROW_NUMBER() OVER (ORDER BY SUM(t.games_played) DESC) AS ord
    FROM public.trusted_country_stats() t
    GROUP BY t.country
    ORDER BY SUM(t.games_played) DESC
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
$$;
COMMENT ON FUNCTION public.get_world_leaders() IS 'Top 3 countries by matches played, all time (home screen).';