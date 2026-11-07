CREATE FUNCTION public.admin_daily_returning_players(_start date DEFAULT '2026-11-01')
RETURNS TABLE(day date, returning_played bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '90s'
AS $function$
WITH boundary AS (SELECT ((_start - 1)::timestamp AT TIME ZONE 'Europe/Stockholm') t),
appdev AS MATERIALIZED (
 SELECT DISTINCT device_id FROM analytics_sessions WHERE platform IN ('ios','android') AND device_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM excluded_stat_devices x WHERE x.device_id=analytics_sessions.device_id)
), gm AS (
 SELECT g.id,(g.updated_at AT TIME ZONE 'Europe/Stockholm')::date dd,g.status::text status,g.forfeited_by,g.forfeited_by_session_id,so.device_id
 FROM games g JOIN game_players p ON p.game_id=g.id AND NOT p.is_bot JOIN session_owners so USING(session_id) JOIN appdev a USING(device_id)
 WHERE g.updated_at >= (SELECT t FROM boundary)
 UNION ALL
 SELECT g.game_id,(g.activity_at AT TIME ZONE 'Europe/Stockholm')::date,g.status,g.forfeited_by,g.forfeited_by_session_id,so.device_id
 FROM admin_match_archive g JOIN admin_match_archive_players p USING(game_id) JOIN session_owners so USING(session_id) JOIN appdev a USING(device_id)
 WHERE g.activity_at >= (SELECT t FROM boundary) AND NOT EXISTS (SELECT 1 FROM games live WHERE live.id=g.game_id)
), play_days AS MATERIALIZED (
 SELECT (e.created_at AT TIME ZONE 'Europe/Stockholm')::date dd,e.device_id FROM analytics_events e
 WHERE e.platform IN ('ios','android') AND e.device_id IS NOT NULL AND e.created_at >= (SELECT t FROM boundary)
 AND e.event_name IN ('game_started','quick_match_started','game_finished','quick_match_online_matched')
 AND NOT EXISTS (SELECT 1 FROM excluded_stat_devices x WHERE x.device_id=e.device_id)
 UNION SELECT ar.day,ar.device_id FROM admin_activity_archive ar JOIN appdev a USING(device_id) WHERE ar.played AND ar.day >= _start-1
 UNION SELECT dd,device_id FROM gm WHERE status='playing' OR (status='finished' AND forfeited_by IS NULL AND forfeited_by_session_id IS NULL)
 UNION SELECT (l.created_at AT TIME ZONE 'Europe/Stockholm')::date,so.device_id
 FROM dice_roll_log l JOIN game_players p ON p.game_id=l.game_id AND p.player_index=l.player_index AND NOT p.is_bot
 JOIN session_owners so USING(session_id) JOIN appdev a USING(device_id) WHERE l.created_at >= (SELECT t FROM boundary)
), repeat_players AS (
 SELECT today.dd,count(*) n FROM play_days today JOIN play_days yesterday ON yesterday.device_id=today.device_id AND yesterday.dd=today.dd-1 GROUP BY 1
), days AS (SELECT generate_series(_start,(now() AT TIME ZONE 'Europe/Stockholm')::date,interval '1 day')::date dd)
SELECT d.dd,coalesce(r.n,0) FROM days d LEFT JOIN repeat_players r USING(dd) ORDER BY 1 DESC;
$function$;
REVOKE ALL ON FUNCTION public.admin_daily_returning_players(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_returning_players(date) TO service_role;
CREATE FUNCTION public.admin_daily_stats_v8(_start date DEFAULT '2026-11-01')
RETURNS TABLE(day date,devices bigint,ios bigint,android bigint,played bigint,cpu_finished bigint,online_finished bigint,forfeits bigint,issues bigint,avg_app_age_days numeric,median_app_age_days numeric,incomplete_columns text[],issue_devices bigint,new_players bigint,referral_new_players bigint,post_match_shown bigint,post_match_opportunities bigint,returning_played bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '90s'
AS $function$
 SELECT s.*,r.returning_played FROM public.admin_daily_stats_v7(_start) s JOIN public.admin_daily_returning_players(_start) r USING(day) ORDER BY s.day DESC;
$function$;
REVOKE ALL ON FUNCTION public.admin_daily_stats_v8(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_stats_v8(date) TO service_role;