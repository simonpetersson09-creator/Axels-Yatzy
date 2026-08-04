-- Add registration-time column to player_country_stats.
ALTER TABLE public.player_country_stats
ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now();

-- Backfill existing rows with the actual registration time from session_owners when available.
UPDATE public.player_country_stats pcs
SET created_at = so.created_at
FROM public.session_owners so
WHERE pcs.session_id = so.session_id;

-- Update the upsert function to preserve registration time on subsequent updates.
CREATE OR REPLACE FUNCTION public.upsert_player_country_stats(
  p_session_id text,
  p_country text,
  p_games_played integer,
  p_device_id text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.claim_session(p_session_id, p_device_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.player_country_stats (session_id, country, games_played, updated_at, created_at)
  VALUES (p_session_id, upper(left(p_country, 2)), LEAST(GREATEST(COALESCE(p_games_played, 0), 0), 100000), now(), now())
  ON CONFLICT (session_id) DO UPDATE
  SET country = EXCLUDED.country,
      games_played = EXCLUDED.games_played,
      updated_at = now();
  -- created_at is intentionally NOT updated, so the first registration time is preserved.
END;
$$;

-- Country rank: unique placement, games played first, then earliest registration wins ties.
CREATE OR REPLACE FUNCTION public.get_country_rank(p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_country text;
  v_games integer;
  v_rank bigint;
  v_total bigint;
BEGIN
  SELECT country, games_played INTO v_country, v_games
  FROM public.player_country_stats
  WHERE session_id = p_session_id;

  IF v_country IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT rank, total INTO v_rank, v_total
  FROM (
    SELECT
      session_id,
      ROW_NUMBER() OVER (PARTITION BY country ORDER BY games_played DESC, created_at ASC) AS rank,
      COUNT(*) OVER (PARTITION BY country) AS total
    FROM public.player_country_stats
    WHERE country = v_country
  ) sub
  WHERE sub.session_id = p_session_id;

  RETURN jsonb_build_object(
    'found', true,
    'country', v_country,
    'games_played', v_games,
    'rank', v_rank,
    'total', v_total
  );
END;
$$;

-- World rank: unique placement, games played first, then earliest registration wins ties.
CREATE OR REPLACE FUNCTION public.get_world_rank(p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_games integer;
  v_rank bigint;
  v_total bigint;
BEGIN
  SELECT games_played INTO v_games
  FROM public.player_country_stats
  WHERE session_id = p_session_id;

  IF v_games IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT rank, total INTO v_rank, v_total
  FROM (
    SELECT
      session_id,
      ROW_NUMBER() OVER (ORDER BY games_played DESC, created_at ASC) AS rank,
      COUNT(*) OVER () AS total
    FROM public.player_country_stats
  ) sub
  WHERE sub.session_id = p_session_id;

  RETURN jsonb_build_object(
    'found', true,
    'games_played', v_games,
    'rank', v_rank,
    'total', v_total
  );
END;
$$;
