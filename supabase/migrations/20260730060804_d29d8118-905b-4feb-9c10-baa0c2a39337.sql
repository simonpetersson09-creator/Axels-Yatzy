
CREATE TABLE IF NOT EXISTS public.session_owners (
  session_id text PRIMARY KEY,
  device_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.session_owners TO service_role;
ALTER TABLE public.session_owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no direct access to session owners"
  ON public.session_owners FOR SELECT USING (false);

CREATE OR REPLACE FUNCTION public.claim_session(p_session_id text, p_device_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner text;
BEGIN
  IF p_session_id IS NULL OR p_session_id = '' OR p_device_id IS NULL OR p_device_id = '' THEN
    RETURN false;
  END IF;

  INSERT INTO public.session_owners (session_id, device_id)
  VALUES (p_session_id, p_device_id)
  ON CONFLICT (session_id) DO NOTHING;

  SELECT device_id INTO v_owner FROM public.session_owners WHERE session_id = p_session_id;
  RETURN v_owner = p_device_id;
END;
$$;

-- Rate limiting helper backed by the existing rate_limits table.
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_min_interval_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_last timestamptz;
BEGIN
  SELECT last_request_at INTO v_last FROM public.rate_limits WHERE key = p_key FOR UPDATE;
  IF v_last IS NOT NULL AND v_last > now() - (p_min_interval_seconds || ' seconds')::interval THEN
    RETURN false;
  END IF;
  INSERT INTO public.rate_limits (key, last_request_at)
  VALUES (p_key, now())
  ON CONFLICT (key) DO UPDATE SET last_request_at = now();
  RETURN true;
END;
$$;

-- Harden leaderboard stat writes: require proof of session ownership.
DROP FUNCTION IF EXISTS public.upsert_player_country_stats(text, text, integer);

CREATE OR REPLACE FUNCTION public.upsert_player_country_stats(
  p_session_id text,
  p_country text,
  p_games_played integer,
  p_device_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.claim_session(p_session_id, p_device_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.player_country_stats (session_id, country, games_played, updated_at)
  VALUES (p_session_id, upper(left(p_country, 2)), LEAST(GREATEST(COALESCE(p_games_played, 0), 0), 100000), now())
  ON CONFLICT (session_id) DO UPDATE
  SET country = EXCLUDED.country,
      games_played = EXCLUDED.games_played,
      updated_at = now();
END;
$$;
