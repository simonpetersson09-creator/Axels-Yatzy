-- lovable-cron-fallback-reviewed: existing 20 s keep-warm job, same cadence; now warms 2 copies; only pings while matches are active
create or replace function public.internal_warm_ping(p_copies integer default 2)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  perform net.http_post(url := 'https://ixzqnmocplgbsawuufsm.supabase.co/functions/v1/' || f,
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4enFubW9jcGxnYnNhd3V1ZnNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MzA4NjcsImV4cCI6MjA4OTAwNjg2N30.q3VxFoy9DFHzJNkf6MQwmHMHJ_mymFENpch1SC67cok"}'::jsonb,
    body := '{"warm":true}'::jsonb, timeout_milliseconds := 10000)
  from unnest(array['roll-dice','toggle-lock','submit-score']) f
  cross join generate_series(1, greatest(1, least(p_copies, 3)));
end $$;
revoke all on function public.internal_warm_ping(integer) from public, anon, authenticated;

create or replace function public.internal_warm_game_functions()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    if public.check_rate_limit('warm_game_functions', 8) then
      perform public.internal_warm_ping(2);
    end if;
  exception when others then null; -- never block game actions
  end;
  return null;
end $$;

drop trigger if exists trg_warm_on_turn_change on public.games;
create trigger trg_warm_on_turn_change after update of current_player_index on public.games
for each row when (old.current_player_index is distinct from new.current_player_index and new.status = 'playing')
execute function public.internal_warm_game_functions();

select cron.unschedule('keep-game-functions-warm');
select cron.schedule('keep-game-functions-warm', '20 seconds',
  $c$select public.internal_warm_ping(2) where exists (select 1 from public.games where status = 'playing' and updated_at > now() - interval '5 minutes')$c$);