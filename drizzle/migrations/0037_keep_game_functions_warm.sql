-- lovable-cron-fallback-reviewed: keep-warm ping is inherently time-based; functions shut down after ~1 min idle
DO $$ BEGIN PERFORM cron.unschedule('keep-game-functions-warm'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'keep-game-functions-warm',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ixzqnmocplgbsawuufsm.supabase.co/functions/v1/' || fn,
    headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4enFubW9jcGxnYnNhd3V1ZnNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MzA4NjcsImV4cCI6MjA4OTAwNjg2N30.q3VxFoy9DFHzJNkf6MQwmHMHJ_mymFENpch1SC67cok'),
    body := '{"warm":true}'::jsonb
  ) FROM unnest(ARRAY['roll-dice','toggle-lock','submit-score']) AS fn;
  $$
);