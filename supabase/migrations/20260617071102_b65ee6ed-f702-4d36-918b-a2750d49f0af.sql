
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
      games_played = EXCLUDED.games_played,
      updated_at = now();
$$;
