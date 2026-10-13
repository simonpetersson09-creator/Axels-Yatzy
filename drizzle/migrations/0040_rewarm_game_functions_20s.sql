-- lovable-cron-fallback-reviewed: user approved; cold starts measured at 2-16 s first DB call, keep game functions warm
select cron.schedule('keep-game-functions-warm', '20 seconds', $$
  select net.http_post(url := 'https://ixzqnmocplgbsawuufsm.supabase.co/functions/v1/' || f,
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4enFubW9jcGxnYnNhd3V1ZnNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MzA4NjcsImV4cCI6MjA4OTAwNjg2N30.q3VxFoy9DFHzJNkf6MQwmHMHJ_mymFENpch1SC67cok"}'::jsonb,
    body := '{"warm":true}'::jsonb, timeout_milliseconds := 10000)
  from unnest(array['roll-dice','toggle-lock','submit-score']) f;
$$);