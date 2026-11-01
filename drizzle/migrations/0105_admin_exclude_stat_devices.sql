CREATE TABLE public.excluded_stat_devices (
  device_id text PRIMARY KEY,
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.excluded_stat_devices TO service_role;
ALTER TABLE public.excluded_stat_devices ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.excluded_stat_devices IS 'Devices excluded from admin daily statistics (active devices, played devices, app age, issues). Service role only; no client access. Match counts are unaffected.';

CREATE OR REPLACE FUNCTION public.admin_daily_stats_v3(_start date DEFAULT '2026-08-01'::date)
 RETURNS TABLE(day date, devices bigint, ios bigint, android bigint, played bigint, cpu_finished bigint, online_finished bigint, forfeits bigint, issues bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
with st as (select ((coalesce(_start, DATE '2026-08-01') - 1) at time zone 'Europe/Stockholm') t),
d as (select generate_series(coalesce(_start, DATE '2026-08-01'), (now() at time zone 'Europe/Stockholm')::date, interval '1 day')::date dd),
latest_releases as (
 select release from (
  select public.admin_issue_release(app_version) release from analytics_sessions where platform in ('ios','android')
  union select public.admin_issue_release(app_version) release from analytics_events where platform in ('ios','android')
  ) versions where release is not null order by release desc limit 2
),
appdev as (select device_id, (array_agg(platform order by last_seen_at desc))[1] plat from analytics_sessions where platform in ('ios','android') and device_id is not null and device_id not in (select device_id from excluded_stat_devices) group by 1),
gm as (
  select g.id, (g.updated_at at time zone 'Europe/Stockholm')::date dd, g.status, g.forfeited_by, g.forfeited_by_session_id, so.device_id
  from games g join game_players p on p.game_id=g.id and not p.is_bot
  join session_owners so on so.session_id=p.session_id
  join appdev a on a.device_id=so.device_id
  where g.updated_at > (select t from st)
),
act as (
  select (started_at at time zone 'Europe/Stockholm')::date dd, device_id, platform from analytics_sessions where platform in ('ios','android') and device_id is not null and device_id not in (select device_id from excluded_stat_devices) and started_at > (select t from st)
  union select (last_seen_at at time zone 'Europe/Stockholm')::date, device_id, platform from analytics_sessions where platform in ('ios','android') and device_id is not null and device_id not in (select device_id from excluded_stat_devices) and last_seen_at > (select t from st)
  union select (created_at at time zone 'Europe/Stockholm')::date, device_id, platform from analytics_events where platform in ('ios','android') and device_id is not null and device_id not in (select device_id from excluded_stat_devices) and created_at > (select t from st)
  union select gm.dd, gm.device_id, a.plat from gm join appdev a using(device_id)
),
s as (select dd, count(distinct device_id) dev, count(distinct device_id) filter (where platform='ios') i, count(distinct device_id) filter (where platform='android') a from act group by 1),
pl as (
  select dd, count(distinct device_id) pl from (
    select (created_at at time zone 'Europe/Stockholm')::date dd, device_id from analytics_events
    where platform in ('ios','android') and device_id is not null and device_id not in (select device_id from excluded_stat_devices) and created_at > (select t from st)
      and event_name in ('game_started','quick_match_started','game_finished','quick_match_online_matched')
    union select dd, device_id from gm where status='playing' or (status='finished' and forfeited_by is null and forfeited_by_session_id is null)
    union select (l.created_at at time zone 'Europe/Stockholm')::date dd, so.device_id
    from dice_roll_log l join game_players p on p.game_id=l.game_id and p.player_index=l.player_index and not p.is_bot
    join session_owners so on so.session_id=p.session_id join appdev a on a.device_id=so.device_id
    where l.created_at > (select t from st)
  ) x group by 1
),
e as (
  select (created_at at time zone 'Europe/Stockholm')::date dd,
    count(*) filter (where event_name='game_finished' and game_mode='single_player') cpu,
    count(*) filter (where event_name='mp_issue' and device_id not in (select device_id from excluded_stat_devices) and public.admin_issue_release(app_version) in (select release from latest_releases)) iss
  from analytics_events where platform in ('ios','android') and created_at > (select t from st) group by 1
),
g as (
  select dd, count(distinct id) filter (where status='finished' and forfeited_by is null and forfeited_by_session_id is null) fin,
    count(distinct id) filter (where forfeited_by_session_id is not null) ff
  from gm group by 1
)
select d.dd, coalesce(dev,0), coalesce(i,0), coalesce(a,0), coalesce(pl,0), coalesce(cpu,0), coalesce(fin,0), coalesce(ff,0), coalesce(iss,0)
from d left join s using(dd) left join pl using(dd) left join e using(dd) left join g using(dd)
order by 1 desc;
$function$;
REVOKE ALL ON FUNCTION public.admin_daily_stats_v3(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_stats_v3(date) TO service_role;
COMMENT ON FUNCTION public.admin_daily_stats_v3(date) IS 'Admin daily counts: devices in excluded_stat_devices are removed from active/played device counts and issues; issues remain restricted to the latest two numeric app releases. Match counts (cpu/online finished, forfeits) are unchanged.';

CREATE OR REPLACE FUNCTION public.admin_daily_stats_v4(_start date DEFAULT '2026-08-01'::date)
RETURNS TABLE(day date, devices bigint, ios bigint, android bigint, played bigint, cpu_finished bigint, online_finished bigint, forfeits bigint, issues bigint, avg_app_age_days numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH appdev AS (
 SELECT device_id,(array_agg(platform ORDER BY last_seen_at DESC))[1] plat
 FROM analytics_sessions WHERE platform IN ('ios','android') AND device_id IS NOT NULL AND device_id NOT IN (SELECT device_id FROM excluded_stat_devices) GROUP BY 1
), activity AS (
 SELECT (started_at AT TIME ZONE 'Europe/Stockholm')::date dd,device_id FROM analytics_sessions WHERE platform IN ('ios','android') AND device_id IS NOT NULL AND device_id NOT IN (SELECT device_id FROM excluded_stat_devices)
 UNION SELECT (last_seen_at AT TIME ZONE 'Europe/Stockholm')::date,device_id FROM analytics_sessions WHERE platform IN ('ios','android') AND device_id IS NOT NULL AND device_id NOT IN (SELECT device_id FROM excluded_stat_devices)
 UNION SELECT (created_at AT TIME ZONE 'Europe/Stockholm')::date,device_id FROM analytics_events WHERE platform IN ('ios','android') AND device_id IS NOT NULL AND device_id NOT IN (SELECT device_id FROM excluded_stat_devices)
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
COMMENT ON FUNCTION public.admin_daily_stats_v4(date) IS 'Daily admin counts plus mean calendar days since first recorded app activity over distinct active device IDs; devices in excluded_stat_devices are removed from the age basis. v3 counts are unchanged.';

CREATE OR REPLACE FUNCTION public.admin_daily_stats_v5(_start date DEFAULT '2026-08-01'::date)
RETURNS TABLE(day date, devices bigint, ios bigint, android bigint, played bigint, cpu_finished bigint, online_finished bigint, forfeits bigint, issues bigint, avg_app_age_days numeric, median_app_age_days numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH appdev AS (
 SELECT device_id,(array_agg(platform ORDER BY last_seen_at DESC))[1] plat
 FROM analytics_sessions WHERE platform IN ('ios','android') AND device_id IS NOT NULL AND device_id NOT IN (SELECT device_id FROM excluded_stat_devices) GROUP BY 1
), activity AS (
 SELECT (started_at AT TIME ZONE 'Europe/Stockholm')::date dd,device_id FROM analytics_sessions WHERE platform IN ('ios','android') AND device_id IS NOT NULL AND device_id NOT IN (SELECT device_id FROM excluded_stat_devices)
 UNION SELECT (last_seen_at AT TIME ZONE 'Europe/Stockholm')::date,device_id FROM analytics_sessions WHERE platform IN ('ios','android') AND device_id IS NOT NULL AND device_id NOT IN (SELECT device_id FROM excluded_stat_devices)
 UNION SELECT (created_at AT TIME ZONE 'Europe/Stockholm')::date,device_id FROM analytics_events WHERE platform IN ('ios','android') AND device_id IS NOT NULL AND device_id NOT IN (SELECT device_id FROM excluded_stat_devices)
 UNION SELECT (g.updated_at AT TIME ZONE 'Europe/Stockholm')::date,so.device_id FROM games g JOIN game_players p ON p.game_id=g.id AND NOT p.is_bot JOIN session_owners so ON so.session_id=p.session_id JOIN appdev a ON a.device_id=so.device_id
), first_seen AS (
 SELECT device_id,min(dd) first_day FROM activity GROUP BY 1
), ages AS (
 SELECT a.dd,public.admin_median_app_age(a.dd,array_agg(f.first_day)) age
 FROM activity a JOIN first_seen f USING(device_id)
 WHERE a.dd >= coalesce(_start,DATE '2026-08-01') GROUP BY 1
)
SELECT s.day,s.devices,s.ios,s.android,s.played,s.cpu_finished,s.online_finished,s.forfeits,s.issues,s.avg_app_age_days,a.age
FROM public.admin_daily_stats_v4(_start) s LEFT JOIN ages a ON a.dd=s.day ORDER BY s.day DESC;
$function$;
REVOKE ALL ON FUNCTION public.admin_daily_stats_v5(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_stats_v5(date) TO service_role;
COMMENT ON FUNCTION public.admin_daily_stats_v5(date) IS 'Daily admin counts and mean age from v4, plus median calendar-day app age; devices in excluded_stat_devices are removed from the age basis and all device counts.';