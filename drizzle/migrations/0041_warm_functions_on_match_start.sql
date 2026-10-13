create or replace function public.internal_warm_game_functions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    if public.check_rate_limit('warm_game_functions', 15) then
      perform net.http_post(url := 'https://ixzqnmocplgbsawuufsm.supabase.co/functions/v1/' || f,
        headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4enFubW9jcGxnYnNhd3V1ZnNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MzA4NjcsImV4cCI6MjA4OTAwNjg2N30.q3VxFoy9DFHzJNkf6MQwmHMHJ_mymFENpch1SC67cok"}'::jsonb,
        body := '{"warm":true}'::jsonb, timeout_milliseconds := 10000)
      from unnest(array['roll-dice','toggle-lock','submit-score']) f;
    end if;
  exception when others then null; -- never block creating a match
  end;
  return null;
end $$;
revoke execute on function public.internal_warm_game_functions() from public, anon, authenticated;

create trigger trg_warm_on_game_insert after insert on public.games
  for each statement execute function public.internal_warm_game_functions();
create trigger trg_warm_on_matchmaking after insert on public.matchmaking_queue
  for each statement execute function public.internal_warm_game_functions();
create trigger trg_warm_on_invite after insert on public.game_invites
  for each statement execute function public.internal_warm_game_functions();