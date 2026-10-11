CREATE TABLE public.weekly_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  session_id text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivered boolean NOT NULL DEFAULT false
);
GRANT ALL ON public.weekly_reminder_log TO service_role;
ALTER TABLE public.weekly_reminder_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages weekly reminders" ON public.weekly_reminder_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX weekly_reminder_log_device_idx ON public.weekly_reminder_log (device_id, sent_at DESC);

CREATE OR REPLACE FUNCTION public.get_weekly_reminder_targets()
RETURNS TABLE(device_id text, session_id text, token text, platform text, lang text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH toks AS (
    SELECT DISTINCT ON (t.device_id) t.device_id, t.session_id, t.token, t.platform
    FROM push_tokens t WHERE t.enabled = true
    ORDER BY t.device_id, t.updated_at DESC
  ),
  ev AS (
    SELECT e.device_id,
      extract(isodow from e.created_at)::int AS dow,
      extract(hour from e.created_at)::int AS h,
      count(*) AS c
    FROM analytics_events e
    WHERE e.event_name IN ('game_started','quick_match_started')
      AND e.created_at > now() - interval '60 days'
      AND e.device_id IN (SELECT toks.device_id FROM toks)
    GROUP BY 1,2,3
  ),
  fav AS (
    SELECT DISTINCT ON (ev.device_id) ev.device_id, ev.dow, ev.h FROM ev
    WHERE ev.c >= 2 ORDER BY ev.device_id, ev.c DESC, ev.dow, ev.h
  )
  SELECT t.device_id, t.session_id, t.token, t.platform, p.lang
  FROM toks t
  LEFT JOIN fav f ON f.device_id = t.device_id
  LEFT JOIN notification_preferences p ON p.device_id = t.device_id
  WHERE coalesce(p.reminder_notifications, true)
    AND coalesce(f.dow, 7) = extract(isodow from now())::int
    AND coalesce(f.h, 17) = extract(hour from now())::int
    AND NOT EXISTS (SELECT 1 FROM weekly_reminder_log l WHERE l.device_id = t.device_id
                    AND l.sent_at > now() - interval '6 days')
    AND NOT EXISTS (SELECT 1 FROM analytics_events a WHERE a.device_id = t.device_id
                    AND a.created_at > now() - interval '12 hours')
$$;
REVOKE ALL ON FUNCTION public.get_weekly_reminder_targets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_weekly_reminder_targets() TO service_role;