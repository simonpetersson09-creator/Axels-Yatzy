-- Reschedule notify-reminders cron to read secret from Vault
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'notify-reminders-every-10min';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

SELECT cron.schedule(
  'notify-reminders-every-10min',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ixzqnmocplgbsawuufsm.supabase.co/functions/v1/notify-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4enFubW9jcGxnYnNhd3V1ZnNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MzA4NjcsImV4cCI6MjA4OTAwNjg2N30.q3VxFoy9DFHzJNkf6MQwmHMHJ_mymFENpch1SC67cok',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_notify_secret' LIMIT 1)
    ),
    body := jsonb_build_object('triggered_at', now())
  );
  $$
);