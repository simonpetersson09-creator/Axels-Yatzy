ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS auth_user_id text;

CREATE INDEX IF NOT EXISTS analytics_events_device_id_idx
  ON public.analytics_events (device_id);
CREATE INDEX IF NOT EXISTS analytics_events_session_id_idx
  ON public.analytics_events (session_id);