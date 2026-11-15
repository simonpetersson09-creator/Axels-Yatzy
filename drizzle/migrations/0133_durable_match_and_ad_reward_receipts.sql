CREATE TABLE public.ad_xp_receipts (
 session_id text NOT NULL REFERENCES public.player_xp(session_id) ON DELETE CASCADE,
 attempt_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(session_id,attempt_id)
);
GRANT ALL ON public.ad_xp_receipts TO service_role;
ALTER TABLE public.ad_xp_receipts ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.match_report_receipts (
 session_id text NOT NULL REFERENCES public.session_owners(session_id) ON DELETE CASCADE,
 match_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(session_id,match_key)
);
GRANT ALL ON public.match_report_receipts TO service_role;
ALTER TABLE public.match_report_receipts ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.award_ad_xp_receipted(p_session_id text,p_device_id text,p_attempt_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r public.player_xp%ROWTYPE; result jsonb;
BEGIN
 IF p_attempt_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.session_owners WHERE session_id=p_session_id AND device_id=p_device_id) THEN RETURN jsonb_build_object('ok',false,'reason','auth'); END IF;
 PERFORM 1 FROM public.session_owners WHERE session_id=p_session_id AND device_id=p_device_id FOR UPDATE;
 INSERT INTO public.player_xp(session_id) VALUES(p_session_id) ON CONFLICT DO NOTHING;
 SELECT * INTO r FROM public.player_xp WHERE session_id=p_session_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.ad_xp_receipts WHERE session_id=p_session_id AND attempt_id=p_attempt_id) THEN RETURN jsonb_build_object('ok',true,'duplicate',true,'xp',r.xp,'earned_today',r.earned_today); END IF;
 result := public.award_ad_xp(p_session_id,p_device_id);
 IF result->>'ok'='true' THEN INSERT INTO public.ad_xp_receipts(session_id,attempt_id) VALUES(p_session_id,p_attempt_id); END IF;
 RETURN result;
END $function$;
REVOKE ALL ON FUNCTION public.award_ad_xp_receipted(text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_ad_xp_receipted(text,text,uuid) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.record_local_yatzy_match(p_session_id text,p_device_id text,p_match_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 IF p_match_key IS NULL OR p_match_key NOT LIKE 'sp:%' OR length(p_match_key)>160 THEN RETURN jsonb_build_object('ok',false,'reason','key'); END IF;
 PERFORM 1 FROM public.session_owners WHERE session_id=p_session_id AND device_id=p_device_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','auth'); END IF;
 IF EXISTS(SELECT 1 FROM public.yatzy_match_log WHERE session_id=p_session_id AND match_key=p_match_key) THEN RETURN jsonb_build_object('ok',true,'duplicate',true); END IF;
 IF NOT public.check_rate_limit('yatzy_match:'||p_session_id,90) THEN RETURN jsonb_build_object('ok',false,'reason','cooldown'); END IF;
 RETURN jsonb_build_object('ok',public.internal_add_yatzy_match(p_session_id,p_match_key));
END $function$;
CREATE OR REPLACE FUNCTION public.report_weekly_score_receipted(p_session_id text,p_device_id text,p_match_key text,p_name text,p_score integer,p_completed_at timestamptz,p_country text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_week date; v_before integer; v_after integer; v_name text; v_country text; v_score integer; inserted boolean;
BEGIN
 IF p_match_key IS NULL OR length(p_match_key)>160 OR length(p_match_key)=0 OR p_completed_at IS NULL OR p_completed_at>now()+interval '5 minutes' THEN RETURN jsonb_build_object('ok',false,'reason','key'); END IF;
 PERFORM 1 FROM public.session_owners WHERE session_id=p_session_id AND device_id=p_device_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','auth'); END IF;
 INSERT INTO public.match_report_receipts(session_id,match_key) VALUES(p_session_id,p_match_key) ON CONFLICT DO NOTHING;
 inserted := FOUND;
 IF NOT inserted THEN RETURN jsonb_build_object('ok',true,'duplicate',true); END IF;
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
REVOKE ALL ON FUNCTION public.report_weekly_score_receipted(text,text,text,text,integer,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_weekly_score_receipted(text,text,text,text,integer,timestamptz,text) TO anon,authenticated,service_role;