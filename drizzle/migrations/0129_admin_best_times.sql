create or replace function public.admin_best_times(_start date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with base as (
  select s.device_id,
         (s.last_seen_at at time zone 'Europe/Stockholm')::date as day,
         extract(isodow from s.last_seen_at at time zone 'Europe/Stockholm')::int as dow,
         extract(hour from s.last_seen_at at time zone 'Europe/Stockholm')::int as hr
  from analytics_sessions s
  where s.platform in ('ios','android')
    and s.device_id is not null
    and s.last_seen_at >= (_start::timestamp at time zone 'Europe/Stockholm')
),
per_day as (
  select dow, day, count(distinct device_id) as devices
  from base
  group by dow, day
),
weekday as (
  select dow, round(avg(devices))::int as avg_devices, count(*)::int as days
  from per_day
  group by dow
  order by avg(devices) desc, dow asc
  limit 1
),
hourly as (
  select hr, count(distinct device_id)::int as devices
  from base
  group by hr
  order by count(distinct device_id) desc, hr asc
  limit 1
)
select jsonb_build_object(
  'weekday', (select jsonb_build_object('dow', dow, 'avg_devices', avg_devices, 'days', days) from weekday),
  'hour', (select jsonb_build_object('hour', hr, 'devices', devices) from hourly)
);
$$;
revoke all on function public.admin_best_times(date) from public, anon, authenticated;
grant execute on function public.admin_best_times(date) to service_role;