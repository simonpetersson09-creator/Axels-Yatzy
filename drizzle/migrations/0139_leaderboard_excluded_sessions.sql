CREATE TABLE IF NOT EXISTS public.leaderboard_excluded_sessions (session_id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.leaderboard_excluded_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.leaderboard_excluded_sessions FROM anon, authenticated;
GRANT ALL ON public.leaderboard_excluded_sessions TO service_role;

CREATE OR REPLACE FUNCTION public.get_weekly_rank(p_session_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rank bigint; v_total bigint; v_games integer;
  v_since date := (now() AT TIME ZONE 'Europe/Stockholm')::date - 7;
BEGIN
  WITH cur AS (
    SELECT s.session_id, s.games_played, s.created_at FROM public.player_country_stats s
    WHERE NOT EXISTS (SELECT 1 FROM public.leaderboard_excluded_sessions x WHERE x.session_id = s.session_id)
  ),
  base AS (
    SELECT c.session_id,
      COALESCE(
        (SELECT h.games_played FROM public.player_games_history h
          WHERE h.session_id = c.session_id AND h.day <= v_since
          ORDER BY h.day DESC LIMIT 1),
        CASE WHEN (c.created_at AT TIME ZONE 'Europe/Stockholm')::date >= v_since THEN 0 END,
        (SELECT h.games_played FROM public.player_games_history h
          WHERE h.session_id = c.session_id ORDER BY h.day ASC LIMIT 1),
        0) AS base_games
    FROM cur c
  ),
  weekly AS (
    SELECT c.session_id, GREATEST(c.games_played - b.base_games, 0) AS w, c.created_at
    FROM cur c JOIN base b USING (session_id)
  ),
  ranked AS (
    SELECT session_id, w,
      ROW_NUMBER() OVER (ORDER BY w DESC, created_at ASC, session_id ASC) AS rank,
      COUNT(*) OVER () AS total
    FROM weekly WHERE w > 0
  )
  SELECT rank, total, w INTO v_rank, v_total, v_games FROM ranked WHERE session_id = p_session_id;

  IF v_rank IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  RETURN jsonb_build_object('found', true, 'rank', v_rank, 'total', v_total, 'games_played', v_games);
END;
$function$;

CREATE OR REPLACE FUNCTION public.report_weekly_score(p_session_id text, p_device_id text, p_name text, p_score integer, p_country text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_week date := public.internal_hof_week();
  v_score integer := LEAST(GREATEST(COALESCE(p_score, 0), 0), 374);
  v_name text := left(split_part(btrim(regexp_replace(COALESCE(p_name, ''), '\s+', ' ', 'g')), ' ', 1), 20);
  v_country text := NULLIF(upper(left(COALESCE(p_country, ''), 2)), '');
BEGIN
  IF p_device_id IS NULL OR NOT public.claim_session(p_session_id, p_device_id) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.leaderboard_excluded_sessions x WHERE x.session_id = p_session_id) THEN RETURN true; END IF;
  IF v_name = '' THEN v_name := 'Spelare'; END IF;
  IF v_country IS NULL THEN
    SELECT c.country INTO v_country FROM public.player_country_stats c WHERE c.session_id=p_session_id;
  END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.report_weekly_score_receipted(p_session_id text, p_device_id text, p_match_key text, p_name text, p_score integer, p_completed_at timestamp with time zone, p_country text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_week date; v_before integer; v_after integer; v_name text; v_country text; v_score integer; inserted boolean;
BEGIN
 IF p_match_key IS NULL OR length(p_match_key)>160 OR length(p_match_key)=0 OR p_completed_at IS NULL OR p_completed_at>now()+interval '5 minutes' THEN RETURN jsonb_build_object('ok',false,'reason','key'); END IF;
 PERFORM 1 FROM public.session_owners WHERE session_id=p_session_id AND device_id=p_device_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','auth'); END IF;
 INSERT INTO public.match_report_receipts(session_id,match_key) VALUES(p_session_id,p_match_key) ON CONFLICT DO NOTHING;
 inserted := FOUND;
 IF NOT inserted THEN RETURN jsonb_build_object('ok',true,'duplicate',true); END IF;
 IF EXISTS (SELECT 1 FROM public.leaderboard_excluded_sessions x WHERE x.session_id = p_session_id) THEN RETURN jsonb_build_object('ok',true,'excluded',true); END IF;
 v_week := date_trunc('week',p_completed_at AT TIME ZONE 'Europe/Stockholm')::date;
 v_before := public.internal_hof_rank(p_session_id);
 v_score := LEAST(GREATEST(COALESCE(p_score,0),0),374);
 v_name := left(split_part(btrim(regexp_replace(COALESCE(p_name,''),'\s+',' ','g')),' ',1),20);
 IF v_name='' THEN v_name:='Spelare'; END IF;
 v_country := NULLIF(upper(left(COALESCE(p_country,''),2)),'');
 IF v_country IS NULL THEN SELECT country INTO v_country FROM public.player_country_stats WHERE session_id=p_session_id; END IF;
 INSERT INTO public.weekly_hall_of_fame(session_id,week_start,first_name,country,best_score,games_played,best_at,updated_at)
 VALUES(p_session_id,v_week,v_name,v_country,v_score,1,p_completed_at,now())
 ON CONFLICT(session_id,week_start) DO UPDATE SET first_name=EXCLUDED.first_name,country=COALESCE(EXCLUDED.country,weekly_hall_of_fame.country),games_played=LEAST(weekly_hall_of_fame.games_played+1,2000),best_at=CASE WHEN EXCLUDED.best_score>weekly_hall_of_fame.best_score THEN p_completed_at ELSE weekly_hall_of_fame.best_at END,best_score=GREATEST(weekly_hall_of_fame.best_score,EXCLUDED.best_score),updated_at=now();
 v_after := public.internal_hof_rank(p_session_id);
 RETURN jsonb_build_object('ok',true,'before',v_before,'after',v_after,'current_week',v_week=public.internal_hof_week());
END $function$;

CREATE OR REPLACE FUNCTION public.internal_log_weekly_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF (TG_OP='INSERT' OR NEW.games_played>OLD.games_played) AND NOT EXISTS (SELECT 1 FROM public.leaderboard_excluded_sessions x WHERE x.session_id = NEW.session_id) THEN
  INSERT INTO public.weekly_game_completions(session_id) VALUES(NEW.session_id);
 END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.trusted_country_stats()
 RETURNS TABLE(session_id text, country text, games_played integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.session_id,
    s.country,
    s.games_played::int AS games_played
  FROM public.player_country_stats s
  WHERE s.games_played > 0
    AND NOT EXISTS (SELECT 1 FROM public.leaderboard_excluded_sessions x WHERE x.session_id = s.session_id)
    AND EXISTS (SELECT 1 FROM public.session_owners o WHERE o.session_id = s.session_id)
    AND s.updated_at >= s.created_at
    AND NOT (s.games_played > 5 AND s.updated_at - s.created_at < interval '10 minutes')
    AND NOT (
      s.games_played > 5
      AND s.games_played::numeric
          / GREATEST(EXTRACT(epoch FROM (s.updated_at - s.created_at)) / 86400.0, 0.5) > 200
    );
$function$;