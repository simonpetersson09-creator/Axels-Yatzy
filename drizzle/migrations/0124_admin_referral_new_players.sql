DROP FUNCTION IF EXISTS public.admin_daily_stats_v7(date);
DROP FUNCTION IF EXISTS public.admin_daily_extra_stats(date);
CREATE FUNCTION public.admin_daily_extra_stats(_start date DEFAULT '2026-11-01')
RETURNS TABLE(day date, issue_devices bigint, new_players bigint, referral_new_players bigint, post_match_shown bigint, post_match_opportunities bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '90s'
AS $function$
WITH raw_versions AS MATERIALIZED (
 SELECT DISTINCT app_version FROM analytics_sessions WHERE platform IN ('ios','android')
 UNION SELECT DISTINCT app_version FROM analytics_events WHERE platform IN ('ios','android')
), latest_releases AS MATERIALIZED (
 SELECT release FROM (SELECT DISTINCT public.admin_issue_release(app_version) release FROM raw_versions) v
 WHERE release IS NOT NULL ORDER BY release DESC LIMIT 2
), appdev AS MATERIALIZED (
 SELECT DISTINCT device_id FROM analytics_sessions WHERE platform IN ('ios','android') AND device_id IS NOT NULL
 UNION SELECT DISTINCT device_id FROM analytics_events WHERE platform IN ('ios','android') AND device_id IS NOT NULL
), events AS MATERIALIZED (
 SELECT e.* FROM analytics_events e WHERE platform IN ('ios','android') AND device_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM excluded_stat_devices x WHERE x.device_id=e.device_id)
), play_days AS (
 SELECT device_id,(created_at AT TIME ZONE 'Europe/Stockholm')::date dd FROM events
 WHERE event_name IN ('game_started','quick_match_started','game_finished','quick_match_online_matched')
 UNION SELECT a.device_id,a.day FROM admin_activity_archive a JOIN appdev d USING(device_id) WHERE a.played
 UNION SELECT so.device_id,(s.finished_at AT TIME ZONE 'Europe/Stockholm')::date FROM online_match_scores s JOIN session_owners so USING(session_id) JOIN appdev d ON d.device_id=so.device_id
 UNION SELECT so.device_id,(l.created_at AT TIME ZONE 'Europe/Stockholm')::date FROM dice_roll_log l JOIN game_players p ON p.game_id=l.game_id AND p.player_index=l.player_index AND NOT p.is_bot JOIN session_owners so USING(session_id) JOIN appdev d ON d.device_id=so.device_id
), first_play AS (
 SELECT device_id,min(dd) dd FROM play_days p WHERE NOT EXISTS (SELECT 1 FROM excluded_stat_devices x WHERE x.device_id=p.device_id) GROUP BY 1
), newcomers AS (SELECT dd,count(*) n FROM first_play GROUP BY 1),
referred AS (
 SELECT fp.dd,count(DISTINCT fp.device_id) n FROM first_play fp
 JOIN session_owners so ON so.device_id=fp.device_id
 WHERE EXISTS (SELECT 1 FROM referral_credits rc WHERE rc.invitee_session_id=so.session_id)
 GROUP BY 1
), problems AS (
 SELECT (created_at AT TIME ZONE 'Europe/Stockholm')::date dd,count(DISTINCT device_id) n FROM events
 WHERE created_at >= (_start::timestamp AT TIME ZONE 'Europe/Stockholm') AND event_name='mp_issue'
 AND public.admin_issue_release(app_version) IN (SELECT release FROM latest_releases) GROUP BY 1
), exits AS (
 SELECT device_id,coalesce(nullif(metadata->>'matchKey',''),metadata->>'event_id',id::text) match_key,
 min(created_at) FILTER (WHERE metadata->>'result'='clicked') clicked_at,
 bool_or(metadata->>'result'='shown') shown
 FROM events WHERE event_name='post_match_exit' AND metadata->>'completed'='true'
 GROUP BY 1,2
), ads AS (
 SELECT (clicked_at AT TIME ZONE 'Europe/Stockholm')::date dd,count(*) opportunities,count(*) FILTER (WHERE shown) shown
 FROM exits WHERE clicked_at >= (_start::timestamp AT TIME ZONE 'Europe/Stockholm') GROUP BY 1
), days AS (
 SELECT generate_series(_start,(now() AT TIME ZONE 'Europe/Stockholm')::date,interval '1 day')::date dd
)
SELECT d.dd,coalesce(p.n,0),coalesce(n.n,0),coalesce(r.n,0),coalesce(a.shown,0),coalesce(a.opportunities,0)
FROM days d LEFT JOIN problems p USING(dd) LEFT JOIN newcomers n USING(dd) LEFT JOIN referred r USING(dd) LEFT JOIN ads a USING(dd) ORDER BY 1 DESC;
$function$;
REVOKE ALL ON FUNCTION public.admin_daily_extra_stats(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_extra_stats(date) TO service_role;
CREATE FUNCTION public.admin_daily_stats_v7(_start date DEFAULT '2026-11-01')
RETURNS TABLE(day date,devices bigint,ios bigint,android bigint,played bigint,cpu_finished bigint,online_finished bigint,forfeits bigint,issues bigint,avg_app_age_days numeric,median_app_age_days numeric,incomplete_columns text[],issue_devices bigint,new_players bigint,referral_new_players bigint,post_match_shown bigint,post_match_opportunities bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '90s'
AS $function$
 SELECT s.*,e.issue_devices,e.new_players,e.referral_new_players,e.post_match_shown,e.post_match_opportunities FROM public.admin_daily_stats_v6(_start) s JOIN public.admin_daily_extra_stats(_start) e USING(day) ORDER BY s.day DESC;
$function$;
REVOKE ALL ON FUNCTION public.admin_daily_stats_v7(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_stats_v7(date) TO service_role;