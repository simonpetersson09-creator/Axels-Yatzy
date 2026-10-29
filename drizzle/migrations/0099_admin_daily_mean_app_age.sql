CREATE FUNCTION public.admin_mean_app_age(_day date, _first_days date[])
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT round(avg(greatest(0, _day - first_day))::numeric, 1) FROM unnest(_first_days) AS t(first_day) WHERE first_day IS NOT NULL $$;
REVOKE ALL ON FUNCTION public.admin_mean_app_age(date,date[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mean_app_age(date,date[]) TO service_role;

CREATE FUNCTION public.admin_daily_stats_v4(_start date DEFAULT '2026-08-01'::date)
RETURNS TABLE(day date, devices bigint, ios bigint, android bigint, played bigint, cpu_finished bigint, online_finished bigint, forfeits bigint, issues bigint, avg_app_age_days numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH appdev AS (
 SELECT device_id,(array_agg(platform ORDER BY last_seen_at DESC))[1] plat
 FROM analytics_sessions WHERE platform IN ('ios','android') AND device_id IS NOT NULL GROUP BY 1
), activity AS (
 SELECT (started_at AT TIME ZONE 'Europe/Stockholm')::date dd,device_id FROM analytics_sessions WHERE platform IN ('ios','android') AND device_id IS NOT NULL
 UNION SELECT (last_seen_at AT TIME ZONE 'Europe/Stockholm')::date,device_id FROM analytics_sessions WHERE platform IN ('ios','android') AND device_id IS NOT NULL
 UNION SELECT (created_at AT TIME ZONE 'Europe/Stockholm')::date,device_id FROM analytics_events WHERE platform IN ('ios','android') AND device_id IS NOT NULL
 UNION SELECT (g.updated_at AT TIME ZONE 'Europe/Stockholm')::date,so.device_id FROM games g JOIN game_players p ON p.game_id=g.id AND NOT p.is_bot JOIN session_owners so ON so.session_id=p.session_id JOIN appdev a ON a.device_id=so.device_id
), first_seen AS (
 SELECT device_id,min(dd) first_day FROM activity GROUP BY 1
), ages AS (
 SELECT a.dd,public.admin_mean_app_age(a.dd,array_agg(f.first_day)) age
 FROM activity a JOIN first_seen f USING(device_id)
 WHERE a.dd >= coalesce(_start,DATE '2026-08-01') GROUP BY 1
)
SELECT s.day,s.devices,s.ios,s.android,s.played,s.cpu_finished,s.online_finished,s.forfeits,s.issues,a.age
FROM public.admin_daily_stats_v3(_start) s LEFT JOIN ages a ON a.dd=s.day ORDER BY s.day DESC;
$function$;
REVOKE ALL ON FUNCTION public.admin_daily_stats_v4(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_stats_v4(date) TO service_role;
COMMENT ON FUNCTION public.admin_daily_stats_v4(date) IS 'Daily admin counts plus mean calendar days since first recorded app activity over distinct active device IDs; historical identity uncertainty and reinstall resets remain. v3 counts are unchanged.';