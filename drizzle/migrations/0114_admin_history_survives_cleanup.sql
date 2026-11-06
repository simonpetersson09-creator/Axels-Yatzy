CREATE TABLE public.admin_match_archive (
 game_id uuid PRIMARY KEY, activity_at timestamptz NOT NULL, status text NOT NULL,
 forfeited_by text, forfeited_by_session_id text, source text NOT NULL
);
GRANT ALL ON public.admin_match_archive TO service_role;
ALTER TABLE public.admin_match_archive ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.admin_match_archive_players (
 game_id uuid NOT NULL REFERENCES public.admin_match_archive(game_id) ON DELETE CASCADE,
 session_id text NOT NULL REFERENCES public.session_owners(session_id) ON DELETE CASCADE,
 PRIMARY KEY(game_id,session_id)
);
GRANT ALL ON public.admin_match_archive_players TO service_role;
ALTER TABLE public.admin_match_archive_players ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.admin_activity_archive (
 device_id text NOT NULL, day date NOT NULL, played boolean NOT NULL DEFAULT false,
 PRIMARY KEY(device_id,day)
);
GRANT ALL ON public.admin_activity_archive TO service_role;
ALTER TABLE public.admin_activity_archive ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.internal_archive_admin_game() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 INSERT INTO admin_match_archive VALUES (OLD.id,OLD.updated_at,OLD.status::text,OLD.forfeited_by,OLD.forfeited_by_session_id,'server')
 ON CONFLICT(game_id) DO UPDATE SET activity_at=EXCLUDED.activity_at,status=EXCLUDED.status,
 forfeited_by=EXCLUDED.forfeited_by,forfeited_by_session_id=EXCLUDED.forfeited_by_session_id,source='server';
 INSERT INTO admin_match_archive_players SELECT OLD.id,p.session_id FROM game_players p
 JOIN session_owners so USING(session_id) WHERE p.game_id=OLD.id AND NOT p.is_bot ON CONFLICT DO NOTHING;
 INSERT INTO admin_activity_archive(device_id,day,played)
 SELECT so.device_id,(OLD.updated_at AT TIME ZONE 'Europe/Stockholm')::date,
 OLD.status='playing' OR (OLD.status='finished' AND OLD.forfeited_by IS NULL AND OLD.forfeited_by_session_id IS NULL)
 FROM game_players p JOIN session_owners so USING(session_id) WHERE p.game_id=OLD.id AND NOT p.is_bot
 GROUP BY so.device_id ON CONFLICT(device_id,day) DO UPDATE SET played=admin_activity_archive.played OR EXCLUDED.played;
 INSERT INTO admin_activity_archive(device_id,day,played)
 SELECT DISTINCT so.device_id,(l.created_at AT TIME ZONE 'Europe/Stockholm')::date,true
 FROM dice_roll_log l JOIN game_players p ON p.game_id=l.game_id AND p.player_index=l.player_index AND NOT p.is_bot
 JOIN session_owners so USING(session_id) WHERE l.game_id=OLD.id
 ON CONFLICT(device_id,day) DO UPDATE SET played=true;
 RETURN OLD;
END;$function$;
REVOKE ALL ON FUNCTION public.internal_archive_admin_game() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.internal_archive_admin_game() TO service_role;
CREATE TRIGGER archive_admin_before_game_delete BEFORE DELETE ON public.games FOR EACH ROW EXECUTE FUNCTION public.internal_archive_admin_game();
CREATE OR REPLACE FUNCTION public.internal_delete_admin_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
 DELETE FROM admin_activity_archive WHERE device_id=OLD.device_id;
 RETURN OLD;
END;$function$;
REVOKE ALL ON FUNCTION public.internal_delete_admin_activity() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.internal_delete_admin_activity() TO service_role;
CREATE TRIGGER delete_admin_activity_on_owner_delete AFTER DELETE ON public.session_owners FOR EACH ROW EXECUTE FUNCTION public.internal_delete_admin_activity();
INSERT INTO public.admin_match_archive(game_id,activity_at,status,source)
SELECT e.game_id::uuid,min(e.created_at),'finished','client_partial' FROM public.analytics_events e
WHERE e.event_name='game_finished' AND e.game_mode='multiplayer' AND e.metadata->>'forfeit'='false'
AND e.platform IN ('ios','android') AND e.game_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
AND NOT EXISTS(SELECT 1 FROM public.games g WHERE g.id::text=e.game_id)
GROUP BY e.game_id ON CONFLICT DO NOTHING;
INSERT INTO public.admin_match_archive(game_id,activity_at,status,source)
SELECT r.game_id::uuid,r.finished_at,'finished','result_partial' FROM public.friend_match_results r
WHERE r.status='finished' AND r.finished_at IS NOT NULL
AND r.game_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
AND NOT EXISTS(SELECT 1 FROM public.games g WHERE g.id::text=r.game_id) ON CONFLICT DO NOTHING;
INSERT INTO public.admin_match_archive_players(game_id,session_id)
SELECT DISTINCT a.game_id,so.session_id FROM public.admin_match_archive a
JOIN public.analytics_events e ON e.game_id=a.game_id::text
JOIN public.session_owners so ON so.session_id=e.session_id AND so.device_id=e.device_id
WHERE e.platform IN ('ios','android') ON CONFLICT DO NOTHING;
INSERT INTO public.admin_match_archive_players(game_id,session_id)
SELECT a.game_id,so.session_id FROM public.admin_match_archive a
JOIN public.friend_match_results r ON r.game_id=a.game_id::text
JOIN public.session_owners so ON so.session_id IN (r.player_1_id,r.player_2_id) ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.admin_daily_stats_v3(_start date DEFAULT '2026-08-01'::date)
 RETURNS TABLE(day date, devices bigint, ios bigint, android bigint, played bigint, cpu_finished bigint, online_finished bigint, forfeits bigint, issues bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
with st as (select ((coalesce(_start, DATE '2026-08-01') - 1) at time zone 'Europe/Stockholm') t),
d as (select generate_series(coalesce(_start, DATE '2026-08-01'), (now() at time zone 'Europe/Stockholm')::date, interval '1 day')::date dd),
latest_releases as (
 select release from (
  select distinct public.admin_issue_release(app_version) release from (
   select distinct app_version from analytics_sessions where platform in ('ios','android')
   union select distinct app_version from analytics_events where platform in ('ios','android')
  ) raw_versions
 ) versions where release is not null order by release desc limit 2
),
appdev as (select device_id, (array_agg(platform order by last_seen_at desc))[1] plat from analytics_sessions where platform in ('ios','android') and device_id is not null and device_id not in (select device_id from excluded_stat_devices) group by 1),
gm as (
  select g.id, (g.updated_at at time zone 'Europe/Stockholm')::date dd, g.status::text AS status, g.forfeited_by, g.forfeited_by_session_id, so.device_id
  from games g join game_players p on p.game_id=g.id and not p.is_bot
  join session_owners so on so.session_id=p.session_id join appdev a on a.device_id=so.device_id
  where g.updated_at > (select t from st)
  UNION ALL
  SELECT g.game_id,(g.activity_at AT TIME ZONE 'Europe/Stockholm')::date,g.status,g.forfeited_by,g.forfeited_by_session_id,so.device_id
  FROM admin_match_archive g JOIN admin_match_archive_players p ON p.game_id=g.game_id
  JOIN session_owners so USING(session_id) JOIN appdev a ON a.device_id=so.device_id
  WHERE g.activity_at > (SELECT t FROM st) AND NOT EXISTS(SELECT 1 FROM games live WHERE live.id=g.game_id)
),
act as (
  select (started_at at time zone 'Europe/Stockholm')::date dd, device_id, platform from analytics_sessions where platform in ('ios','android') and device_id is not null and device_id not in (select device_id from excluded_stat_devices) and started_at > (select t from st)
  union select (last_seen_at at time zone 'Europe/Stockholm')::date, device_id, platform from analytics_sessions where platform in ('ios','android') and device_id is not null and device_id not in (select device_id from excluded_stat_devices) and last_seen_at > (select t from st)
  union select (created_at at time zone 'Europe/Stockholm')::date, device_id, platform from analytics_events where platform in ('ios','android') and device_id is not null and device_id not in (select device_id from excluded_stat_devices) and created_at > (select t from st)
  union select gm.dd, gm.device_id, a.plat from gm join appdev a using(device_id)
  union select ar.day,ar.device_id,a.plat from admin_activity_archive ar join appdev a using(device_id)
),
s as (select dd, count(distinct device_id) dev, count(distinct device_id) filter (where platform='ios') i, count(distinct device_id) filter (where platform='android') a from act group by 1),
pl as (
  select dd, count(distinct device_id) pl from (
    select (created_at at time zone 'Europe/Stockholm')::date dd, device_id from analytics_events
    where platform in ('ios','android') and device_id is not null and device_id not in (select device_id from excluded_stat_devices) and created_at > (select t from st)
      and event_name in ('game_started','quick_match_started','game_finished','quick_match_online_matched')
    union select ar.day,ar.device_id from admin_activity_archive ar join appdev a using(device_id) where ar.played
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
from d left join s using(dd) left join pl using(dd) left join e using(dd) left join g using(dd) order by 1 desc;
$function$;
CREATE OR REPLACE FUNCTION public.admin_daily_stats_v4(_start date DEFAULT '2026-08-01'::date)
 RETURNS TABLE(day date, devices bigint, ios bigint, android bigint, played bigint, cpu_finished bigint, online_finished bigint, forfeits bigint, issues bigint, avg_app_age_days numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '90s'
AS $function$
WITH appdev AS (
 SELECT device_id,(array_agg(platform ORDER BY last_seen_at DESC))[1] plat
 FROM analytics_sessions WHERE platform IN ('ios','android') AND device_id IS NOT NULL AND device_id NOT IN (SELECT device_id FROM excluded_stat_devices) GROUP BY 1
), activity AS (
 SELECT (started_at AT TIME ZONE 'Europe/Stockholm')::date dd,device_id FROM analytics_sessions WHERE platform IN ('ios','android') AND device_id IS NOT NULL AND device_id NOT IN (SELECT device_id FROM excluded_stat_devices)
 UNION SELECT (last_seen_at AT TIME ZONE 'Europe/Stockholm')::date,device_id FROM analytics_sessions WHERE platform IN ('ios','android') AND device_id IS NOT NULL AND device_id NOT IN (SELECT device_id FROM excluded_stat_devices)
 UNION SELECT (created_at AT TIME ZONE 'Europe/Stockholm')::date,device_id FROM analytics_events WHERE platform IN ('ios','android') AND device_id IS NOT NULL AND device_id NOT IN (SELECT device_id FROM excluded_stat_devices)
 UNION SELECT (g.updated_at AT TIME ZONE 'Europe/Stockholm')::date,so.device_id FROM games g JOIN game_players p ON p.game_id=g.id AND NOT p.is_bot JOIN session_owners so ON so.session_id=p.session_id JOIN appdev a ON a.device_id=so.device_id
 UNION SELECT ar.day,ar.device_id FROM admin_activity_archive ar JOIN appdev a USING(device_id)
 UNION SELECT (g.activity_at AT TIME ZONE 'Europe/Stockholm')::date,so.device_id FROM admin_match_archive g JOIN admin_match_archive_players p ON p.game_id=g.game_id JOIN session_owners so USING(session_id) JOIN appdev a ON a.device_id=so.device_id
), first_seen AS (SELECT device_id,min(dd) first_day FROM activity GROUP BY 1), ages AS (
 SELECT a.dd,public.admin_mean_app_age(a.dd,array_agg(f.first_day)) age FROM activity a JOIN first_seen f USING(device_id)
 WHERE a.dd >= coalesce(_start,DATE '2026-08-01') GROUP BY 1
)
SELECT s.day,s.devices,s.ios,s.android,s.played,s.cpu_finished,s.online_finished,s.forfeits,s.issues,a.age
FROM public.admin_daily_stats_v3(_start) s LEFT JOIN ages a ON a.dd=s.day ORDER BY s.day DESC;
$function$;
CREATE OR REPLACE FUNCTION public.admin_daily_stats_v6(_start date DEFAULT '2026-08-01')
RETURNS TABLE(day date,devices bigint,ios bigint,android bigint,played bigint,cpu_finished bigint,online_finished bigint,forfeits bigint,issues bigint,avg_app_age_days numeric,median_app_age_days numeric,incomplete_columns text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '90s' AS $function$
 SELECT s.*,CASE WHEN s.day < DATE '2026-11-06' OR EXISTS (SELECT 1 FROM admin_match_archive a WHERE a.source <> 'server' AND (a.activity_at AT TIME ZONE 'Europe/Stockholm')::date=s.day)
 THEN ARRAY['devices','ios','android','played','online_finished','forfeits','total','avg_app_age_days'] ELSE ARRAY['avg_app_age_days'] END
 FROM public.admin_daily_stats_v5(_start) s;
$function$;
REVOKE ALL ON FUNCTION public.admin_daily_stats_v6(date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_daily_stats_v6(date) TO service_role;
COMMENT ON TABLE public.admin_match_archive IS 'Internal admin evidence, survives game cleanup. Pre-2026-11-06 reconstructed history is incomplete and approximate in day attribution; never authoritative player statistics.';