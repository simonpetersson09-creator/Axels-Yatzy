CREATE OR REPLACE FUNCTION public.admin_daily_stats_v4(_start date DEFAULT '2026-08-01'::date)
 RETURNS TABLE(day date, devices bigint, ios bigint, android bigint, played bigint, cpu_finished bigint, online_finished bigint, forfeits bigint, issues bigint, avg_app_age_days numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '90s'
AS $function$
WITH appdev AS (
 SELECT device_id,(array_agg(platform ORDER BY last_seen_at DESC))[1] plat
 FROM analytics_sessions WHERE platform IN ('ios','android') AND device_id IS NOT NULL AND device_id NOT IN (SELECT device_id FROM excluded_stat_devices) GROUP BY 1
), app_activity AS (
 SELECT (started_at AT TIME ZONE 'Europe/Stockholm')::date dd,device_id FROM analytics_sessions WHERE platform IN ('ios','android') AND device_id IS NOT NULL AND device_id NOT IN (SELECT device_id FROM excluded_stat_devices)
 UNION SELECT (last_seen_at AT TIME ZONE 'Europe/Stockholm')::date,device_id FROM analytics_sessions WHERE platform IN ('ios','android') AND device_id IS NOT NULL AND device_id NOT IN (SELECT device_id FROM excluded_stat_devices)
 UNION SELECT (created_at AT TIME ZONE 'Europe/Stockholm')::date,device_id FROM analytics_events WHERE platform IN ('ios','android') AND device_id IS NOT NULL AND device_id NOT IN (SELECT device_id FROM excluded_stat_devices)
), activity AS (
 SELECT dd, device_id FROM app_activity
 UNION SELECT (g.updated_at AT TIME ZONE 'Europe/Stockholm')::date,so.device_id FROM games g JOIN game_players p ON p.game_id=g.id AND NOT p.is_bot JOIN session_owners so ON so.session_id=p.session_id JOIN appdev a ON a.device_id=so.device_id
 UNION SELECT ar.day,ar.device_id FROM admin_activity_archive ar JOIN appdev a USING(device_id)
 UNION SELECT (g.activity_at AT TIME ZONE 'Europe/Stockholm')::date,so.device_id FROM admin_match_archive g JOIN admin_match_archive_players p ON p.game_id=g.game_id JOIN session_owners so USING(session_id) JOIN appdev a ON a.device_id=so.device_id
), first_seen AS (SELECT device_id,min(dd) first_day FROM app_activity GROUP BY 1), ages AS (
 SELECT a.dd,public.admin_mean_app_age(a.dd,array_agg(f.first_day)) age FROM activity a JOIN first_seen f USING(device_id)
 WHERE a.dd >= coalesce(_start,DATE '2026-08-01') GROUP BY 1
)
SELECT s.day,s.devices,s.ios,s.android,s.played,s.cpu_finished,s.online_finished,s.forfeits,s.issues,a.age
FROM public.admin_daily_stats_v3(_start) s LEFT JOIN ages a ON a.dd=s.day ORDER BY s.day DESC;
$function$;

CREATE OR REPLACE FUNCTION public.admin_daily_stats_v6(_start date DEFAULT '2026-08-01'::date)
 RETURNS TABLE(day date, devices bigint, ios bigint, android bigint, played bigint, cpu_finished bigint, online_finished bigint, forfeits bigint, issues bigint, avg_app_age_days numeric, median_app_age_days numeric, incomplete_columns text[])
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '90s'
AS $function$
 SELECT s.*, CASE WHEN s.day < DATE '2026-11-01'
 THEN ARRAY['devices','ios','android','played','online_finished','forfeits','total','avg_app_age_days'] ELSE ARRAY[]::text[] END
 FROM public.admin_daily_stats_v5(_start) s;
$function$;