CREATE TABLE IF NOT EXISTS public.analytics_sessions (
  id text PRIMARY KEY,
  device_id text,
  platform text,
  app_version text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.analytics_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert analytics sessions"
  ON public.analytics_sessions FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update analytics sessions"
  ON public.analytics_sessions FOR UPDATE TO anon, authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can read analytics sessions"
  ON public.analytics_sessions FOR SELECT TO service_role
  USING (true);

CREATE POLICY "Service role can delete analytics sessions"
  ON public.analytics_sessions FOR DELETE TO service_role
  USING (true);

CREATE INDEX IF NOT EXISTS analytics_sessions_device_id_idx
  ON public.analytics_sessions (device_id);
CREATE INDEX IF NOT EXISTS analytics_sessions_started_at_idx
  ON public.analytics_sessions (started_at DESC);