CREATE OR REPLACE FUNCTION public.trusted_country_stats()
RETURNS TABLE (session_id text, country text, games_played integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    s.session_id,
    s.country,
    LEAST(s.games_played, 1000)::int AS games_played
  FROM public.player_country_stats s
  WHERE s.games_played > 0
    -- must be claimed by a real device
    AND EXISTS (SELECT 1 FROM public.session_owners o WHERE o.session_id = s.session_id)
    -- corrupt timestamps
    AND s.updated_at >= s.created_at
    -- bulk injection: many matches within a very short lifespan
    AND NOT (s.games_played > 5 AND s.updated_at - s.created_at < interval '10 minutes')
    -- unrealistic growth rate
    AND NOT (
      s.games_played > 5
      AND s.games_played::numeric
          / GREATEST(EXTRACT(epoch FROM (s.updated_at - s.created_at)) / 86400.0, 0.5) > 200
    );
$$;

CREATE OR REPLACE FUNCTION public.get_world_leader()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_country text;
  v_games integer;
BEGIN
  SELECT t.country, COALESCE(SUM(t.games_played), 0)::int
  INTO v_country, v_games
  FROM public.trusted_country_stats() t
  GROUP BY t.country
  ORDER BY SUM(t.games_played) DESC
  LIMIT 1;

  IF v_country IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object('found', true, 'country', v_country, 'games_played', v_games);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_world_leaders()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_leaders jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('country', sub.country, 'games_played', sub.games_played)
    ORDER BY sub.ord
  ), '[]'::jsonb)
  INTO v_leaders
  FROM (
    SELECT
      t.country,
      COALESCE(SUM(t.games_played), 0)::int AS games_played,
      ROW_NUMBER() OVER (ORDER BY SUM(t.games_played) DESC) AS ord
    FROM public.trusted_country_stats() t
    GROUP BY t.country
    ORDER BY SUM(t.games_played) DESC
    LIMIT 3
  ) sub;

  IF jsonb_array_length(v_leaders) = 0 THEN
    RETURN jsonb_build_object('found', false, 'leaders', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object('found', true, 'leaders', v_leaders);
END;
$$;