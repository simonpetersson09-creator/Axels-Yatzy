CREATE OR REPLACE FUNCTION public.admin_daily_stats_v3(_start date DEFAULT '2026-08-01'::date)
 RETURNS TABLE(day date, devices bigint, ios bigint, android bigint, played bigint, cpu_finished bigint, online_finished bigint, forfeits bigint, issues bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
with st as (select ((coalesce(_start, DATE '2026-08-01') - 1) at time zone 'Europe/Stockholm') t),
d as (select generate_series(coalesce(_start, DATE '2026-08-01'), (now() at time zone 'Europe/Stockholm')::date, interval '1 day')::date dd),
appdev as (select device_id, (array_agg(platform order by last_seen_at desc))[1] plat from analytics_sessions where platform in ('ios','android') and device_id is not null group by 1),
gm as (
  select g.id, (g.updated_at at time zone 'Europe/Stockholm')::date dd, g.status, g.forfeited_by, g.forfeited_by_session_id, so.device_id
  from games g join game_players p on p.game_id=g.id and not p.is_bot
  join session_owners so on so.session_id=p.session_id
  join appdev a on a.device_id=so.device_id
  where g.updated_at > (select t from st)
),
act as (
  select (started_at at time zone 'Europe/Stockholm')::date dd, device_id, platform from analytics_sessions where platform in ('ios','android') and device_id is not null and started_at > (select t from st)
  union select (last_seen_at at time zone 'Europe/Stockholm')::date, device_id, platform from analytics_sessions where platform in ('ios','android') and device_id is not null and last_seen_at > (select t from st)
  union select (created_at at time zone 'Europe/Stockholm')::date, device_id, platform from analytics_events where platform in ('ios','android') and device_id is not null and created_at > (select t from st)
  union select gm.dd, gm.device_id, a.plat from gm join appdev a using(device_id)
),
s as (select dd, count(distinct device_id) dev, count(distinct device_id) filter (where platform='ios') i, count(distinct device_id) filter (where platform='android') a from act group by 1),
pl as (
  select dd, count(distinct device_id) pl from (
    select (created_at at time zone 'Europe/Stockholm')::date dd, device_id from analytics_events
    where platform in ('ios','android') and device_id is not null and created_at > (select t from st)
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
    count(*) filter (where event_name='mp_issue') iss
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