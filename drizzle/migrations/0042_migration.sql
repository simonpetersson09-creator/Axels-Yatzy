CREATE OR REPLACE FUNCTION public.trg_server_health_alert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_slow int; v_fail int; v_max int;
BEGIN
  IF NEW.event_name <> 'server_timing' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM analytics_events WHERE event_name='server_alert' AND created_at > now() - interval '5 minutes') THEN
    RETURN NEW;
  END IF;
  SELECT count(*) FILTER (WHERE (metadata->>'total_ms')::int >= 2000),
         count(*) FILTER (WHERE (metadata->>'ok') = 'false'),
         max((metadata->>'total_ms')::int)
    INTO v_slow, v_fail, v_max
    FROM analytics_events
   WHERE event_name = 'server_timing' AND created_at > now() - interval '5 minutes';
  IF v_slow >= 3 OR v_fail >= 2 THEN
    INSERT INTO analytics_events(event_name, platform, metadata)
    VALUES ('server_alert', 'server', jsonb_build_object('slow', v_slow, 'failed', v_fail, 'max_ms', v_max, 'at', now()));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;

CREATE TRIGGER trg_server_health_alert AFTER INSERT ON public.analytics_events
FOR EACH ROW WHEN (NEW.event_name = 'server_timing') EXECUTE FUNCTION public.trg_server_health_alert();

CREATE OR REPLACE FUNCTION public.internal_cleanup_diagnostics()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM analytics_events
   WHERE event_name IN ('server_timing','mp_issue','server_alert')
     AND created_at < now() - interval '30 days';
END $$;

REVOKE ALL ON FUNCTION public.internal_cleanup_diagnostics() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_server_health_alert() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('cleanup-diagnostics-daily', '17 3 * * *', 'SELECT public.internal_cleanup_diagnostics();');