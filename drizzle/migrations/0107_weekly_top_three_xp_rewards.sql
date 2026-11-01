CREATE TABLE public.weekly_reward_periods (week_start date PRIMARY KEY, settled_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.weekly_reward_periods TO service_role;
ALTER TABLE public.weekly_reward_periods ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.weekly_xp_rewards (
 session_id text NOT NULL REFERENCES public.player_xp(session_id) ON DELETE CASCADE,
 week_start date NOT NULL REFERENCES public.weekly_reward_periods(week_start),
 list text NOT NULL CHECK (list IN ('score','games')),
 rank integer NOT NULL CHECK (rank BETWEEN 1 AND 3),
 xp integer NOT NULL CHECK (xp = 4 - rank),
 awarded_at timestamptz NOT NULL DEFAULT now(), acknowledged_at timestamptz,
 PRIMARY KEY (session_id, week_start, list), UNIQUE (week_start,list,rank)
);
GRANT ALL ON public.weekly_xp_rewards TO service_role;
ALTER TABLE public.weekly_xp_rewards ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.weekly_xp_rewards IS 'Server-owned separate weekly list prizes. Wallet deletion cascades; settled periods prevent re-awarding deleted prizes.';
CREATE OR REPLACE FUNCTION public.internal_settle_weekly_rewards()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_week date;
BEGIN
 PERFORM pg_advisory_xact_lock(74183021);
 FOR v_week IN SELECT DISTINCT week_start FROM public.weekly_hall_of_fame WHERE week_start >= DATE '2026-10-26' AND week_start < public.internal_hof_week() AND NOT EXISTS (SELECT 1 FROM public.weekly_reward_periods p WHERE p.week_start = weekly_hall_of_fame.week_start) ORDER BY week_start LOOP
  INSERT INTO public.weekly_reward_periods(week_start) VALUES (v_week);
  INSERT INTO public.player_xp(session_id) SELECT session_id FROM public.weekly_hall_of_fame WHERE week_start=v_week ON CONFLICT DO NOTHING;
  WITH ranked AS (
   SELECT session_id,'score'::text AS list,row_number() OVER (ORDER BY best_score DESC,best_at ASC,session_id ASC)::integer AS rank FROM public.weekly_hall_of_fame WHERE week_start=v_week AND best_score>0
   UNION ALL
   SELECT session_id,'games'::text,row_number() OVER (ORDER BY games_played DESC,best_score DESC,updated_at ASC,session_id ASC)::integer FROM public.weekly_hall_of_fame WHERE week_start=v_week AND games_played>0
  ), awarded AS (
   INSERT INTO public.weekly_xp_rewards(session_id,week_start,list,rank,xp) SELECT session_id,v_week,list,rank,4-rank FROM ranked WHERE rank<=3 RETURNING session_id,xp
  ), totals AS (SELECT session_id,sum(xp)::integer AS xp FROM awarded GROUP BY session_id)
  UPDATE public.player_xp p SET xp=p.xp+t.xp,updated_at=now() FROM totals t WHERE p.session_id=t.session_id;
 END LOOP;
END $function$;
REVOKE ALL ON FUNCTION public.internal_settle_weekly_rewards() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.internal_settle_weekly_rewards() TO service_role;
CREATE OR REPLACE FUNCTION public.get_weekly_xp_rewards(p_session_id text,p_device_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.session_owners WHERE session_id=p_session_id AND device_id=p_device_id) THEN RETURN jsonb_build_object('ok',false); END IF;
 PERFORM public.internal_settle_weekly_rewards();
 RETURN jsonb_build_object('ok',true,'xp',coalesce((SELECT xp FROM public.player_xp WHERE session_id=p_session_id),0),'rewards',coalesce((SELECT jsonb_agg(jsonb_build_object('week_start',week_start,'list',list,'rank',rank,'xp',xp) ORDER BY week_start,list) FROM public.weekly_xp_rewards WHERE session_id=p_session_id AND acknowledged_at IS NULL),'[]'::jsonb));
END $function$;
REVOKE ALL ON FUNCTION public.get_weekly_xp_rewards(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_weekly_xp_rewards(text,text) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.ack_weekly_xp_rewards(p_session_id text,p_device_id text,p_week_start date)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.session_owners WHERE session_id=p_session_id AND device_id=p_device_id) THEN RETURN false; END IF;
 UPDATE public.weekly_xp_rewards SET acknowledged_at=now() WHERE session_id=p_session_id AND week_start=p_week_start AND acknowledged_at IS NULL;
 RETURN true;
END $function$;
REVOKE ALL ON FUNCTION public.ack_weekly_xp_rewards(text,text,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ack_weekly_xp_rewards(text,text,date) TO anon,authenticated,service_role;
-- Stockholm Monday midnight is Sunday 22 UTC in summer, 23 UTC in winter.
-- One named weekly job covers both; the earlier winter run cannot settle the open week.
SELECT cron.schedule('settle-weekly-xp-rewards','0 22,23 * * 0','SELECT public.internal_settle_weekly_rewards();');