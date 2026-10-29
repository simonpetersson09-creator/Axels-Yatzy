CREATE OR REPLACE FUNCTION public.admin_daily_stats_v3(_start date DEFAULT DATE '2026-08-01')
 RETURNS TABLE(day date, devices bigint, ios bigint, android bigint, played bigint, cpu_finished bigint, online_finished bigint, forfeits bigint, issues bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with d as (
  select generate_series(coalesce(_start, DATE '2026-08-01'), (now() at time zone 'Europe/Stockholm')::date, interval '1 day')::date dd
),
s as (
  select (started_at at time zone 'Europe/Stockholm')::date dd,
         count(distinct device_id) dev,
         count(distinct device_id) filter (where platform='ios') i,
         count(distinct device_id) filter (where platform='android') a
  from analytics_sessions
  where platform in ('ios','android')
    and started_at > ((coalesce(_start, DATE '2026-08-01') - 1) at time zone 'Europe/Stockholm')
  group by 1
),
e as (
  select (created_at at time zone 'Europe/Stockholm')::date dd,
    count(distinct device_id) filter (where event_name in ('game_started','quick_match_started','game_finished','quick_match_online_matched')) pl,
    count(*) filter (where event_name='game_finished' and game_mode='single_player') cpu,
    count(*) filter (where event_name='mp_issue') iss
  from analytics_events
  where platform in ('ios','android')
    and created_at > ((coalesce(_start, DATE '2026-08-01') - 1) at time zone 'Europe/Stockholm')
  group by 1
),
g as (
  select (updated_at at time zone 'Europe/Stockholm')::date dd,
    count(*) filter (where status='finished' and forfeited_by_session_id is null) fin,
    count(*) filter (where forfeited_by_session_id is not null) ff
  from games
  where updated_at > ((coalesce(_start, DATE '2026-08-01') - 1) at time zone 'Europe/Stockholm')
  group by 1
)
select d.dd, coalesce(dev,0), coalesce(i,0), coalesce(a,0), coalesce(pl,0), coalesce(cpu,0), coalesce(fin,0), coalesce(ff,0), coalesce(iss,0)
from d left join s using(dd) left join e using(dd) left join g using(dd)
order by 1 desc;
$function$;

REVOKE ALL ON FUNCTION public.admin_daily_stats_v3(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_daily_stats_v3(date) TO service_role;