create or replace function public.claim_play_reminder_targets()
returns table(device_id text, session_id text, token text, platform text, lang text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform pg_advisory_xact_lock(875321);

  return query
  with toks as (
    select distinct on (t.device_id) t.device_id, t.session_id, t.token, t.platform, t.created_at
    from push_tokens t
    where t.enabled = true
    order by t.device_id, t.updated_at desc
  ),
  eligible as (
    select k.device_id, k.session_id, k.token, k.platform,
           coalesce(nullif(p.lang, ''), 'en') as lang,
           case
             when st.last_sent_at is null then 0
             when coalesce(act.last_activity, k.created_at) > st.last_sent_at then 0
             else st.reminders_sent
           end as effective_sent
    from toks k
    join notification_preferences p on p.device_id = k.device_id
    left join lateral (
      select max(s.last_seen_at) as last_activity
      from analytics_sessions s
      where s.device_id = k.device_id
    ) act on true
    left join play_reminder_state st on st.device_id = k.device_id
    where p.play_reminders
      and p.timezone is not null
      and p.timezone in (select tz.name from pg_timezone_names tz)
      and extract(hour from now() at time zone p.timezone) = 18
      and coalesce(act.last_activity, k.created_at) < now() - interval '7 days'
      and (st.last_sent_at is null or st.last_sent_at < now() - interval '7 days')
  ),
  claimed as (
    insert into play_reminder_state (device_id, reminders_sent, last_sent_at, updated_at)
    select e.device_id, e.effective_sent + 1, now(), now()
    from eligible e
    where e.effective_sent < 3
    on conflict on constraint play_reminder_state_pkey do update
      set reminders_sent = excluded.reminders_sent,
          last_sent_at = excluded.last_sent_at,
          updated_at = excluded.updated_at
    returning play_reminder_state.device_id
  )
  select e.device_id, e.session_id, e.token, e.platform, e.lang
  from eligible e
  join claimed c on c.device_id = e.device_id;
end;
$function$;

revoke all on function public.claim_play_reminder_targets() from public, anon, authenticated;
grant execute on function public.claim_play_reminder_targets() to service_role;
grant execute on function public.claim_play_reminder_targets() to sandbox_exec, sandbox_exec_ixzqnmocplgbsawuufsm;