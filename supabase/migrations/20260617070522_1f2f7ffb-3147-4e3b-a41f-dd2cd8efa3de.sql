
CREATE TABLE public.player_country_stats (
  session_id text PRIMARY KEY,
  country text NOT NULL,
  games_played integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.player_country_stats TO anon, authenticated;
GRANT ALL ON public.player_country_stats TO service_role;

ALTER TABLE public.player_country_stats ENABLE ROW LEVEL SECURITY;

-- Reads/writes are session-scoped via RPCs; block direct table access from clients.
CREATE POLICY "no direct access" ON public.player_country_stats FOR SELECT USING (false);

CREATE INDEX idx_player_country_stats_country_games
  ON public.player_country_stats (country, games_played DESC);

CREATE OR REPLACE FUNCTION public.upsert_player_country_stats(
  p_session_id text,
  p_country text,
  p_games_played integer
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.player_country_stats (session_id, country, games_played, updated_at)
  VALUES (p_session_id, upper(left(p_country, 2)), GREATEST(p_games_played, 0), now())
  ON CONFLICT (session_id) DO UPDATE
  SET country = EXCLUDED.country,
      games_played = GREATEST(public.player_country_stats.games_played, EXCLUDED.games_played),
      updated_at = now();
$$;

CREATE OR REPLACE FUNCTION public.get_country_rank(p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_country text;
  v_games integer;
  v_better integer;
  v_total integer;
BEGIN
  SELECT country, games_played INTO v_country, v_games
  FROM public.player_country_stats
  WHERE session_id = p_session_id;

  IF v_country IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT count(*) INTO v_better
  FROM public.player_country_stats
  WHERE country = v_country AND games_played > v_games;

  SELECT count(*) INTO v_total
  FROM public.player_country_stats
  WHERE country = v_country;

  RETURN jsonb_build_object(
    'found', true,
    'country', v_country,
    'games_played', v_games,
    'rank', v_better + 1,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_player_country_stats(text, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_country_rank(text) TO anon, authenticated;
