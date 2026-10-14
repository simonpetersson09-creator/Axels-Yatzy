CREATE TABLE public.weekly_hall_of_fame (
  session_id text NOT NULL,
  week_start date NOT NULL,
  first_name text NOT NULL,
  country text,
  best_score integer NOT NULL DEFAULT 0,
  games_played integer NOT NULL DEFAULT 0,
  best_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, week_start)
);
GRANT ALL ON public.weekly_hall_of_fame TO service_role;
ALTER TABLE public.weekly_hall_of_fame ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no direct access to hall of fame" ON public.weekly_hall_of_fame FOR SELECT USING (false);
CREATE INDEX weekly_hall_of_fame_week_score_idx ON public.weekly_hall_of_fame (week_start, best_score DESC, best_at);

CREATE OR REPLACE FUNCTION public.internal_hof_week() RETURNS date
LANGUAGE sql STABLE SET search_path TO 'public'
AS $$ SELECT date_trunc('week', (now() AT TIME ZONE 'Europe/Stockholm'))::date $$;

CREATE OR REPLACE FUNCTION public.report_weekly_score(p_session_id text, p_device_id text, p_name text, p_score integer, p_country text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_week date := public.internal_hof_week();
  v_score integer := LEAST(GREATEST(COALESCE(p_score, 0), 0), 374);
  v_name text := left(split_part(btrim(regexp_replace(COALESCE(p_name, ''), '\s+', ' ', 'g')), ' ', 1), 20);
  v_country text := NULLIF(upper(left(COALESCE(p_country, ''), 2)), '');
BEGIN
  IF p_device_id IS NULL OR NOT public.claim_session(p_session_id, p_device_id) THEN RETURN false; END IF;
  IF v_name = '' THEN v_name := 'Spelare'; END IF;
  INSERT INTO public.weekly_hall_of_fame (session_id, week_start, first_name, country, best_score, games_played, best_at, updated_at)
  VALUES (p_session_id, v_week, v_name, v_country, v_score, 1, now(), now())
  ON CONFLICT (session_id, week_start) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    country = COALESCE(EXCLUDED.country, weekly_hall_of_fame.country),
    games_played = LEAST(weekly_hall_of_fame.games_played + 1, 2000),
    best_at = CASE WHEN EXCLUDED.best_score > weekly_hall_of_fame.best_score THEN now() ELSE weekly_hall_of_fame.best_at END,
    best_score = GREATEST(weekly_hall_of_fame.best_score, EXCLUDED.best_score),
    updated_at = now();
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.get_weekly_hall_of_fame(p_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'session_id', session_id, 'name', first_name, 'country', country,
    'best_score', best_score, 'games_played', games_played) ORDER BY best_score DESC, best_at ASC), '[]'::jsonb)
  FROM (
    SELECT * FROM public.weekly_hall_of_fame
    WHERE week_start = public.internal_hof_week() AND best_score > 0
    ORDER BY best_score DESC, best_at ASC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50)
  ) t
$$;

REVOKE ALL ON FUNCTION public.report_weekly_score(text, text, text, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.report_weekly_score(text, text, text, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_weekly_hall_of_fame(integer) TO anon, authenticated;