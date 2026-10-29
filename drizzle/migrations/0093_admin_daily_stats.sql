CREATE OR REPLACE FUNCTION public.admin_daily_stats(_days integer DEFAULT 30)
RETURNS TABLE(day date, devices bigint, ios bigint, android bigint, played bigint, quick_started bigint, quick_devices bigint, online_finished bigint, quick_online bigint, forfeits bigint, issues bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
with d as (select generate_series((now() at time zone 'Europe/Stockholm')::date-(_days-1),(now() at time zone 'Europe/Stockholm')::date,interval '1 day')::date dd),
s as (select (started_at at time zone 'Europe/Stockholm')::date dd, count(distinct device_id) dev, count(distinct device_id) filter (where platform='ios') i, count(distinct device_id) filter (where platform='android') a from analytics_sessions where platform in ('ios','android') and started_at > now()-make_interval(days=>_days+1) group by 1),
e as (select (created_at at time zone 'Europe/Stockholm')::date dd,
 count(distinct device_id) filter (where event_name in ('game_started','quick_match_started','game_finished','quick_match_online_matched')) pl,
 count(*) filter (where event_name='quick_match_started') qs,
 count(distinct device_id) filter (where event_name='quick_match_started') qd,
 count(*) filter (where event_name='mp_issue') iss
 from analytics_events where platform in ('ios','android') and created_at > now()-make_interval(days=>_days+1) group by 1),
g as (select (updated_at at time zone 'Europe/Stockholm')::date dd, count(*) filter (where status='finished' and forfeited_by_session_id is null) fin, count(*) filter (where is_quick_match and status='finished') qm, count(*) filter (where forfeited_by_session_id is not null) ff from games where updated_at > now()-make_interval(days=>_days+1) group by 1)
select d.dd, coalesce(dev,0),coalesce(i,0),coalesce(a,0),coalesce(pl,0),coalesce(qs,0),coalesce(qd,0),coalesce(fin,0),coalesce(qm,0),coalesce(ff,0),coalesce(iss,0)
from d left join s using(dd) left join e using(dd) left join g using(dd) order by 1 desc;
$$;
REVOKE ALL ON FUNCTION public.admin_daily_stats(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_stats(integer) TO service_role;